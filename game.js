(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const ui = {
    level: document.getElementById('levelNumber'), speed: document.getElementById('speedValue'),
    speedFill: document.getElementById('speedFill'), gear: document.getElementById('gearValue'),
    gearCaption: document.getElementById('gearCaption'), time: document.getElementById('timeValue'),
    bumps: document.getElementById('bumpValue'), status: document.getElementById('statusText'),
    toast: document.getElementById('toast'), hint: document.getElementById('sceneHint'),
    complete: document.getElementById('levelComplete'), completeText: document.getElementById('completeText'),
    next: document.getElementById('nextButton'), restart: document.getElementById('restartButton'),
    pause: document.getElementById('pauseButton'), sound: document.getElementById('soundButton')
  };
  const W = 960, H = 620;
  const keys = new Set();
  const levels = [
    { target: 815, title: 'THE EASY ONE', car: 'mint', text: 'A perfect first park. Smooth and steady.' },
    { target: 540, title: 'TIGHT FIT', car: 'blue', text: 'Nice work. That one took a little more finesse.' },
    { target: 320, title: 'HOME STRETCH', car: 'orange', text: 'Three for three. You make it look easy.' }
  ];
  const palette = ['#d7e5d7','#d7e5d7','#d7e5d7','#d7e5d7','#d7e5d7','#d7e5d7','#d7e5d7','#d7e5d7','#d7e5d7'];
  let levelIndex = 0, player, obstacles, cones, elapsed = 0, bumps = 0, completed = false, paused = false;
  let lastTime = performance.now(), toastTimer = 0, parkingProgress = 0, soundOn = false;
  let audioContext;

  function setCanvasSize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }
  new ResizeObserver(setCanvasSize).observe(canvas);
  window.addEventListener('resize', setCanvasSize);

  function setupLevel(resetBumps = false) {
    const spec = levels[levelIndex];
    if (resetBumps) bumps = 0;
    player = { x: 122, y: 322, angle: 0, v: 0, steer: 0, bumpFlash: 0 };
    obstacles = [];
    const upperX = [155, 265, 375, 485, 595, 705, 815, 905];
    upperX.forEach((x, i) => obstacles.push({ x, y: 123, angle: Math.PI / 2, color: ['#9ca8a1','#d5a77d','#82959e','#c5c6b5'][i % 4] }));
    const lowerX = [155, 265, 375, 485, 595, 705, 815, 905];
    lowerX.forEach((x, i) => {
      if (Math.abs(x - spec.target) < 3) return;
      obstacles.push({ x, y: 487, angle: Math.PI / 2, color: ['#a8b8b0','#d3c7b1','#849a9b','#b88e7e'][i % 4] });
    });
    // A few parked cars sit on the far edge of the lot, away from the driving lane.
    obstacles.push({ x: 72, y: 123, angle: Math.PI / 2, color: '#b7c1af' });
    cones = [{x:915,y:365},{x:915,y:410},{x:76,y:365},{x:76,y:410}];
    elapsed = 0; parkingProgress = 0; completed = false; paused = false;
    ui.level.textContent = String(levelIndex + 1).padStart(2, '0');
    ui.complete.classList.remove('show');
    ui.pause.textContent = 'Ⅱ';
    updateDashboard();
    showToast(spec.title, 1500);
  }

  function showToast(message, duration = 1100) {
    ui.toast.textContent = message;
    ui.toast.classList.add('show');
    toastTimer = duration;
  }
  function updateDashboard() {
    const kmh = Math.round(Math.abs(player.v) * .34);
    ui.speed.textContent = String(kmh).padStart(2, '0');
    ui.speedFill.style.width = `${Math.min(kmh / 55 * 100, 100)}%`;
    ui.gear.textContent = Math.abs(player.v) < 2 ? 'P' : player.v < 0 ? 'R' : 'D';
    ui.gearCaption.textContent = Math.abs(player.v) < 2 ? 'PARKED' : player.v < 0 ? 'REVERSE' : 'DRIVE';
    const minutes = Math.floor(elapsed / 60), seconds = Math.floor(elapsed % 60);
    ui.time.textContent = `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
    ui.bumps.innerHTML = `${bumps}<span class="bump-limit"> / 3</span>`;
    ui.status.textContent = completed ? 'COMPLETE' : paused ? 'PAUSED' : Math.abs(player.v) < 1 ? 'READY' : 'IN MOTION';
    ui.status.style.color = bumps >= 3 ? '#ff9d87' : '';
  }

  function roundedRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function drawBackground() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#263331'; ctx.fillRect(0, 0, W, H);
    // Subtle asphalt grain.
    for (let i=0;i<165;i++) {
      const x = (i * 197 + 31) % W, y = (i * 113 + 17) % H;
      ctx.fillStyle = i % 3 ? 'rgba(204,214,188,.025)' : 'rgba(5,12,10,.07)';
      ctx.fillRect(x, y, 1 + (i % 2), 1);
    }
    // Lot perimeter and planted edges.
    roundedRect(28, 29, 904, 562, 20, '#303e3a', '#52615a');
    roundedRect(47, 47, 866, 526, 13, '#3a4541', null);
    ctx.fillStyle = '#303d39'; ctx.fillRect(49, 48, 862, 30); ctx.fillRect(49, 559, 862, 14);
    for (let x=74; x<900; x+=46) {
      roundedRect(x, 53, 26, 19, 8, x%3 ? '#526557' : '#60705a', null);
      ctx.fillStyle='rgba(190,205,151,.17)';ctx.beginPath();ctx.arc(x+10,59,3,0,Math.PI*2);ctx.fill();
    }
    // Parking bays in the top and bottom rows.
    ctx.strokeStyle='rgba(225,229,205,.34)';ctx.lineWidth=1.4;ctx.setLineDash([]);
    const slots=[100,210,320,430,540,650,760,870];
    slots.forEach(x=>{ctx.beginPath();ctx.moveTo(x,79);ctx.lineTo(x,170);ctx.stroke();ctx.beginPath();ctx.moveTo(x,438);ctx.lineTo(x,559);ctx.stroke();});
    ctx.beginPath();ctx.moveTo(50,170);ctx.lineTo(910,170);ctx.stroke();
    ctx.beginPath();ctx.moveTo(50,438);ctx.lineTo(910,438);ctx.stroke();
    // Main travel lane with center dashes.
    ctx.fillStyle='#414b46';ctx.fillRect(50,185,860,235);
    ctx.strokeStyle='rgba(218,222,198,.22)';ctx.setLineDash([17,16]);ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(74,303);ctx.lineTo(886,303);ctx.stroke();ctx.setLineDash([]);
    // Entrance arrows and pedestrian walk.
    ctx.fillStyle='rgba(227,232,210,.43)';
    for(let i=0;i<5;i++)ctx.fillRect(88+i*9,260,5,39);
    ctx.save();ctx.translate(98,356);ctx.rotate(-Math.PI/2);ctx.fillStyle='rgba(214,221,202,.6)';ctx.font='10px monospace';ctx.fillText('IN',0,0);ctx.restore();
    // Bay target, softly pulsing.
    const target=levels[levelIndex].target;
    const pulse=.10+Math.sin(performance.now()/270)*.04;
    ctx.fillStyle=`rgba(200,243,106,${pulse})`;ctx.fillRect(target-39,439,78,118);
    ctx.strokeStyle='rgba(200,243,106,.85)';ctx.lineWidth=2;ctx.setLineDash([6,5]);ctx.strokeRect(target-39,439,78,118);ctx.setLineDash([]);
    // Bay mouth chevron, points into the space.
    ctx.strokeStyle='rgba(200,243,106,.75)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(target-10,430);ctx.lineTo(target,439);ctx.lineTo(target+10,430);ctx.stroke();
    ctx.fillStyle='rgba(200,243,106,.84)';ctx.font='9px monospace';ctx.textAlign='center';ctx.fillText('PARK HERE',target,548);ctx.textAlign='left';
    // Small lamps and lot signage.
    for(const x of [180,480,780]) {ctx.fillStyle='rgba(224,229,195,.45)';ctx.beginPath();ctx.arc(x,200,2,0,Math.PI*2);ctx.fill();}
  }

  function drawCar(car, isPlayer=false) {
    ctx.save();ctx.translate(car.x,car.y);ctx.rotate(car.angle);
    const L=isPlayer?47:44, B=isPlayer?24:23;
    // Soft shadow.
    ctx.fillStyle='rgba(0,0,0,.32)';roundedRect(-L/2+2,-B/2+4,L,B,7,ctx.fillStyle,null);
    let body;
    if(isPlayer) body='#c8f36a'; else body=car.color;
    if(isPlayer && car.bumpFlash>0) body=(Math.floor(car.bumpFlash*16)%2)?'#ff927d':'#c8f36a';
    roundedRect(-L/2,-B/2,L,B,7,body,null);
    // Hood / trunk and side sill detail.
    roundedRect(L*.16,-B*.37,L*.25,B*.74,4,isPlayer?'#ddffa0':'rgba(255,255,255,.21)',null);
    roundedRect(-L*.34,-B*.34,L*.19,B*.68,3,isPlayer?'#9cc94e':'rgba(30,40,39,.2)',null);
    // Panoramic windows.
    roundedRect(-L*.12,-B*.34,L*.29,B*.68,4,isPlayer?'#344d47':'#35464a',null);
    ctx.fillStyle='rgba(226,240,224,.22)';ctx.fillRect(-L*.05,-B*.29,2,B*.58);
    // Wheels.
    ctx.fillStyle='#18201f';
    for(const wx of [-L*.28,L*.26])for(const wy of [-B*.49,B*.49])roundedRect(wx-5,wy-2.5,10,5,2,'#19211f',null);
    // Headlights / tail lights.
    ctx.fillStyle=isPlayer?'#fff3bd':'#f1e7c6';roundedRect(L/2-3,-B*.31,2,4,1,ctx.fillStyle,null);roundedRect(L/2-3,B*.13,2,4,1,ctx.fillStyle,null);
    ctx.fillStyle='#fa715e';roundedRect(-L/2,-B*.31,2,4,1,ctx.fillStyle,null);roundedRect(-L/2,B*.13,2,4,1,ctx.fillStyle,null);
    if(isPlayer){ctx.fillStyle='rgba(244,255,198,.65)';ctx.beginPath();ctx.moveTo(L/2, -B*.2);ctx.lineTo(L/2+27,-B*.8);ctx.lineTo(L/2+27,B*.8);ctx.lineTo(L/2,B*.2);ctx.closePath();ctx.fill();}
    ctx.restore();
  }
  function drawCone(cone) {
    ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(cone.x+2,cone.y+6,10,6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ef835f';ctx.beginPath();ctx.moveTo(cone.x,cone.y-9);ctx.lineTo(cone.x+8,cone.y+7);ctx.lineTo(cone.x-8,cone.y+7);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#f7d8b8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cone.x-5,cone.y+1);ctx.lineTo(cone.x+5,cone.y+1);ctx.stroke();
  }
  function render() {
    drawBackground();
    obstacles.forEach(o=>drawCar(o));cones.forEach(drawCone);
    if(player)drawCar(player,true);
    if(paused&&!completed){ctx.fillStyle='rgba(12,20,20,.62)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#c8f36a';ctx.textAlign='center';ctx.font='bold 17px Manrope';ctx.fillText('PAUSED',W/2,H/2-3);ctx.fillStyle='#d3ddd4';ctx.font='10px monospace';ctx.fillText('PRESS SPACE OR TAP II TO RESUME',W/2,H/2+20);ctx.textAlign='left';}
  }

  function carCorners(car) {
    const c=Math.cos(car.angle), s=Math.sin(car.angle), L=22.5, B=11.5;
    return [[-L,-B],[L,-B],[L,B],[-L,B]].map(([x,y])=>[car.x+x*c-y*s,car.y+x*s+y*c]);
  }
  function polygonsOverlap(a,b) {
    for(const poly of [a,b]) for(let i=0;i<poly.length;i++) {
      const p1=poly[i],p2=poly[(i+1)%poly.length], axis=[-(p2[1]-p1[1]),p2[0]-p1[0]];
      let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
      for(const p of a){const d=p[0]*axis[0]+p[1]*axis[1];amin=Math.min(amin,d);amax=Math.max(amax,d);}
      for(const p of b){const d=p[0]*axis[0]+p[1]*axis[1];bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}
      if(amax < bmin || bmax < amin)return false;
    }
    return true;
  }
  function hasCollision() {
    const poly=carCorners(player);
    if(poly.some(([x,y])=>x<49||x>911||y<79||y>558))return true;
    for(const car of obstacles) if(polygonsOverlap(poly,carCorners(car)))return true;
    for(const cone of cones) if(Math.hypot(player.x-cone.x,player.y-cone.y)<22)return true;
    return false;
  }
  function angleDiff(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
  function parkCheck(dt) {
    const target=levels[levelIndex].target;
    const centered=Math.abs(player.x-target)<17&&Math.abs(player.y-488)<26;
    const aligned=Math.abs(angleDiff(player.angle,Math.PI/2))<.24;
    if(centered&&aligned&&Math.abs(player.v)<14){
      parkingProgress+=dt;
      ui.status.textContent='HOLD STEADY';
      if(parkingProgress>.85) finishLevel();
    } else parkingProgress=Math.max(0,parkingProgress-dt*1.7);
  }
  function finishLevel() {
    if(completed)return;
    completed=true;player.v=0;
    const score=Math.max(0,100-Math.round(elapsed*1.4)-bumps*12);
    ui.completeText.textContent=`${levels[levelIndex].text}  •  ${score}% parking score`;
    ui.next.innerHTML=levelIndex===levels.length-1?'PLAY AGAIN <span>↻</span>':'NEXT LEVEL <span>→</span>';
    ui.complete.classList.add('show');
    updateDashboard();playTone(660,.12);setTimeout(()=>playTone(880,.16),120);
  }
  function playTone(freq,duration=.08) {
    if(!soundOn)return;
    try{audioContext??=new AudioContext();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.frequency.value=freq;osc.type='sine';gain.gain.setValueAtTime(.035,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration);}catch{}
  }
  function inputDown(name){return keys.has(name);}
  function update(dt) {
    if(!paused&&!completed) {
      elapsed+=dt;
      const forward=inputDown('w')||inputDown('arrowup')||inputDown('forward');
      const reverse=inputDown('s')||inputDown('arrowdown')||inputDown('reverse');
      const left=inputDown('a')||inputDown('arrowleft')||inputDown('left');
      const right=inputDown('d')||inputDown('arrowright')||inputDown('right');
      const brake=inputDown(' ')||inputDown('brake');
      const oldX=player.x,oldY=player.y,oldAngle=player.angle;
      const throttle=(forward?1:0)-(reverse?1:0);
      if(throttle) player.v+=throttle*124*dt;
      else player.v*=Math.pow(.985,dt*60);
      if(brake)player.v*=Math.pow(.88,dt*60);
      player.v=Math.max(-74,Math.min(153,player.v));
      const steer=((right?1:0)-(left?1:0));
      const steerAmount=Math.min(Math.abs(player.v)/52,1);
      player.angle+=steer*steerAmount*1.82*dt*(player.v<0?-1:1);
      player.x+=Math.cos(player.angle)*player.v*dt;
      player.y+=Math.sin(player.angle)*player.v*dt;
      player.bumpFlash=Math.max(0,player.bumpFlash-dt);
      if(hasCollision()) {
        player.x=oldX;player.y=oldY;player.angle=oldAngle;player.v=0;player.bumpFlash=.5;
        bumps++;playTone(130,.1);
        showToast(bumps>=3?'OOPS — TRY AGAIN':'BUMP! TAKE IT SLOW',1200);
        if(bumps>=3){setTimeout(()=>{if(bumps>=3){bumps=0;setupLevel(false);showToast('FRESH START — YOU GOT THIS',1500);}},950);}
      } else parkCheck(dt);
      if(Math.abs(player.v)>3)ui.hint.classList.add('hidden');
    }
    if(toastTimer>0){toastTimer-=dt*1000;if(toastTimer<=0)ui.toast.classList.remove('show');}
    updateDashboard();render();
  }
  function loop(now){const dt=Math.min((now-lastTime)/1000,.035);lastTime=now;update(dt);requestAnimationFrame(loop);}

  window.addEventListener('keydown',e=>{
    const key=e.key.toLowerCase();
    if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();
    keys.add(key);
    if(key===' '&&!e.repeat&&paused)togglePause();
    if(key==='r'&&!e.repeat)setupLevel(true);
    if((key==='escape'||key==='p')&&!e.repeat)togglePause();
  });
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur',()=>keys.clear());
  document.querySelectorAll('[data-control]').forEach(button=>{
    const name=button.dataset.control;
    const down=e=>{e.preventDefault();keys.add(name);button.classList.add('active');try{button.setPointerCapture(e.pointerId);}catch{}};
    const up=e=>{e.preventDefault();keys.delete(name);button.classList.remove('active');};
    button.addEventListener('pointerdown',down);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);
  });
  function togglePause(){if(completed)return;paused=!paused;ui.pause.textContent=paused?'▶':'Ⅱ';updateDashboard();}
  ui.restart.addEventListener('click',()=>setupLevel(true));
  ui.pause.addEventListener('click',togglePause);
  ui.next.addEventListener('click',()=>{levelIndex=(levelIndex+1)%levels.length;setupLevel(true);});
  ui.sound.addEventListener('click',()=>{soundOn=!soundOn;ui.sound.classList.toggle('sound-on',soundOn);ui.sound.innerHTML=`${soundOn?'♫':'♫'} <span>${soundOn?'ON':'SOUND'}</span>`;if(soundOn)playTone(520,.08);});
  // Avoid stuck keys when the page loses focus or is switched in the browser.
  document.addEventListener('visibilitychange',()=>{if(document.hidden)keys.clear();});
  setupLevel(true);setCanvasSize();requestAnimationFrame(loop);
})();
