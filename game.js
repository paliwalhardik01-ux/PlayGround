import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

(() => {
  const canvas = document.getElementById('gameCanvas');
  const ui = {
    level: document.getElementById('levelNumber'), subtitle: document.getElementById('levelSubtitle'),
    speed: document.getElementById('speedValue'), speedFill: document.getElementById('speedFill'),
    gear: document.getElementById('gearValue'), gearCaption: document.getElementById('gearCaption'),
    time: document.getElementById('timeValue'), bumps: document.getElementById('bumpValue'), status: document.getElementById('statusText'),
    toast: document.getElementById('toast'), hint: document.getElementById('sceneHint'), complete: document.getElementById('levelComplete'),
    completeText: document.getElementById('completeText'), completeTitle: document.getElementById('completeTitle'), completeKicker: document.getElementById('completeKicker'),
    next: document.getElementById('nextButton'), restart: document.getElementById('restartButton'), pause: document.getElementById('pauseButton'),
    sound: document.getElementById('soundButton'), camera: document.getElementById('cameraButton'), objective: document.getElementById('objectiveText'),
    garage: document.getElementById('carList'), garageCount: document.getElementById('garageCount')
  };
  const carSpecs = [
    {name:'Alto', kind:'hatch', color:0xb6d5bd, emoji:'🚗', size:1.00},
    {name:'Verna', kind:'sedan', color:0xa9c8dc, emoji:'🚘', size:1.05},
    {name:'Creta', kind:'crossover', color:0xd9b78c, emoji:'🚙', size:1.09},
    {name:'Thar', kind:'offroad', color:0x9fba79, emoji:'🚙', size:1.10},
    {name:'Scorpio', kind:'suv', color:0xc2b7a3, emoji:'🚙', size:1.15},
    {name:'Fortuner', kind:'suv', color:0xb8c3c6, emoji:'🚙', size:1.18},
    {name:'Range Rover', kind:'luxury', color:0x9db3b5, emoji:'🚙', size:1.20},
    {name:'Defender', kind:'offroad', color:0xc5c5a5, emoji:'🚙', size:1.23},
    {name:'G-Wagon', kind:'boxy', color:0xd4c0a5, emoji:'🚙', size:1.22}
  ];
  const MAX_LEVELS = 50;
  const levelNames = ['FIRST LESSON','NARROW BAY','CONE SLALOM','PARKING ROW','TIGHT TURN','WORK ZONE','HEAVY TRAFFIC','PRECISION BAY','MASTER DRIVER'];
  const levelHints = ['A gentle introduction. Get comfortable with the steering.', 'The bay is tighter. Take it slow and line up early.', 'Cones are in the lane. Steer around them cleanly.', 'Park between the painted lines with traffic nearby.', 'A sharp approach and a smaller target await.', 'Work-zone barriers leave little room to maneuver.', 'Navigate the busy lot without collecting a bump.', 'A precision park for your largest unlocked vehicle.', 'The final test. One clean park to earn your stripes.'];
  const slotXs = [-10.5,-7.5,-4.5,-1.5,1.5,4.5,7.5,10.5];
  const targetXs = Array.from({length:MAX_LEVELS},(_,index)=>slotXs[(6-index+slotXs.length)%slotXs.length]);
  const keys = new Set();
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('parkit-progress') || '{}'); } catch {}
  let highestLevel = Math.max(0, Math.min(MAX_LEVELS - 1, Number(saved.highestLevel) || 0));
  let unlockedCars = Math.max(1, Math.min(carSpecs.length, highestLevel + 1));
  let selectedCar = Math.max(0, Math.min(unlockedCars - 1, Number(saved.selectedCar) || 0));
  let levelIndex = 0, player, elapsed = 0, bumps = 0, completed = false, paused = false;
  let parkingProgress = 0, toastTimer = 0, soundOn = false, audioContext, cameraMode = 1;
  let lastTime = performance.now();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x263633);
  scene.fog = new THREE.Fog(0x263633, 29, 58);
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
  const cameraHome = new THREE.Vector3(0, 25, 23);
  camera.position.copy(cameraHome);
  camera.lookAt(0, 0, 0);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
  } catch (error) {
    const message = document.createElement('div');
    message.className = 'render-error';
    message.textContent = '3D graphics are unavailable in this browser. Try enabling WebGL to play.';
    canvas.replaceWith(message);
    console.error(error);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  scene.add(new THREE.HemisphereLight(0xdce9d9, 0x39453b, 2.2));
  const sun = new THREE.DirectionalLight(0xffedc9, 3.1);
  sun.position.set(-9, 18, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -17; sun.shadow.camera.right = 17; sun.shadow.camera.top = 15; sun.shadow.camera.bottom = -15;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xb7d7e8, .65); fill.position.set(12, 8, -8); scene.add(fill);
  const lot = new THREE.Group(); scene.add(lot);
  const staticColliders = [];
  let targetMarker, playerRoot, playerModel, cockpitModel;
  const obstacles = [];
  const cones = [];

  function mat(color, roughness=.78, metalness=0) { return new THREE.MeshStandardMaterial({color, roughness, metalness}); }
  const asphalt = mat(0x3c4742), curbMat = mat(0x667363), paintMat = new THREE.MeshStandardMaterial({color:0xd2d8c6, roughness:.8, transparent:true, opacity:.58}), tireMat = mat(0x19201e), glassMat = new THREE.MeshStandardMaterial({color:0x263c40, roughness:.25, metalness:.18}), trimMat = mat(0x303a37,.55,.25);
  function box(parent, x,y,z, sx,sy,sz, material, cast=true, receive=true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), material);
    mesh.position.set(x,y,z); mesh.castShadow=cast; mesh.receiveShadow=receive; parent.add(mesh); return mesh;
  }
  function cylinder(parent,x,y,z,r,h,material,segments=12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),material);
    mesh.position.set(x,y,z); mesh.castShadow=true; parent.add(mesh); return mesh;
  }
  function addTree(x,z,scale=1) {
    const tree = new THREE.Group(); tree.position.set(x,0,z); tree.scale.setScalar(scale); lot.add(tree);
    cylinder(tree,0,.62,0,.12,1.25,mat(0x6a5942),8);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(.8,1),mat(0x617b5b)); crown.position.set(0,1.65,0); crown.castShadow=true; tree.add(crown);
    const top = new THREE.Mesh(new THREE.IcosahedronGeometry(.55,1),mat(0x78906a)); top.position.set(.13,2.1,-.08); top.castShadow=true; tree.add(top);
  }
  function addLine(x,z,sx,sz,material=paintMat,y=.025) { box(lot,x,y,z,sx,.025,sz,material,false,true); }
  function addLotSign() {
    const group=new THREE.Group();group.position.set(12.85,0,-4.8);group.rotation.y=-Math.PI/2;lot.add(group);
    for(const z of [-.7,.7])box(group,0,1.05,z,.12,2.1,.12,trimMat);
    box(group,0,1.9,0,.18,1.15,2.15,mat(0x263531,.48,.1));
    const art=document.createElement('canvas');art.width=512;art.height=256;
    const ctx=art.getContext('2d');ctx.fillStyle='#263531';ctx.fillRect(0,0,512,256);ctx.strokeStyle='#c8f36a';ctx.lineWidth=7;ctx.strokeRect(14,14,484,228);
    ctx.fillStyle='#c8f36a';ctx.font='700 54px Manrope, sans-serif';ctx.textAlign='center';ctx.fillText('PARK IT',256,112);
    ctx.fillStyle='#e7eee2';ctx.font='500 23px monospace';ctx.fillText('DRIVER TRAINING',256,163);ctx.fillText('NORTH LOT  •  50 LEVELS',256,202);
    const texture=new THREE.CanvasTexture(art);texture.colorSpace=THREE.SRGBColorSpace;
    const face=new THREE.Mesh(new THREE.PlaneGeometry(2.02,.99),new THREE.MeshBasicMaterial({map:texture}));face.position.set(.101,1.9,0);face.rotation.y=Math.PI/2;group.add(face);
  }

  function addCarModel(spec, isPlayer=false) {
    const scale=spec.size || 1;
    const dims={hatch:[2.45,1.18,1.35],sedan:[2.8,1.13,1.34],crossover:[2.65,1.32,1.52],offroad:[2.8,1.42,1.58],suv:[2.95,1.45,1.62],luxury:[3.05,1.39,1.65],boxy:[2.86,1.5,1.62]}[spec.kind] || [2.7,1.25,1.5];
    const L=dims[0]*scale,W=dims[2]*scale,H=dims[1]*scale;
    const group=new THREE.Group(); group.userData.radius=(L+W)*.31;
    const bodyMat=mat(isPlayer?0xc8f36a:spec.color,.36,.15);
    const glass=glassMat.clone();
    // Ground shadow and lower chassis.
    box(group,0,.29,0,L*.86,.34*scale,W*.9,trimMat);
    box(group,0,.49,0,L,H*.52,W,bodyMat);
    const hoodLength=spec.kind==='boxy'?.34:.32;
    box(group,L*.25,.74,0,L*hoodLength,.18*scale,W*.91,bodyMat);
    box(group,-L*.34,.70,0,L*.17,.14*scale,W*.86,bodyMat);
    const cabinLength=spec.kind==='sedan'?.43:spec.kind==='hatch'?.43:.45;
    const cabin=new THREE.Mesh(new THREE.BoxGeometry(L*cabinLength,H*.48,W*.76),glass);
    cabin.position.set(-L*.045,.89,0); cabin.castShadow=true; group.add(cabin);
    // Roof panel, window pillars and windshield glints give each procedural car a readable 3D silhouette.
    const roofMaterial=spec.kind==='luxury'?mat(0x263238,.35,.28):bodyMat;
    box(group,-L*.07,1.15*scale,0,L*.35,.09*scale,W*.72,roofMaterial);
    box(group,L*.09,.9,0,L*.035,.34*scale,W*.79,trimMat);
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(W*.63,.24*scale),new THREE.MeshBasicMaterial({color:0xc8e1de,transparent:true,opacity:.2,side:THREE.DoubleSide}));
    windshield.rotation.y=Math.PI/2; windshield.position.set(L*.19,.98,0); group.add(windshield);
    // Front and rear bumpers.
    box(group,L*.5,.42,0,.13,.22*scale,W*.94,trimMat);
    box(group,-L*.5,.42,0,.13,.22*scale,W*.94,trimMat);
    const wheelBase=L*.32, wheelOffset=W*.48, wheelRadius=(spec.kind==='offroad'||spec.kind==='boxy'?.36:.29)*scale;
    for(const wx of [-wheelBase,wheelBase]) for(const wz of [-wheelOffset,wheelOffset]) {
      const wheel=cylinder(group,wx,.31,wz,wheelRadius,.18*scale,tireMat,16);
      wheel.rotation.x=Math.PI/2;
      const hub=cylinder(group,wx,.31,wz+Math.sign(wz)*.095*scale,wheelRadius*.43,.02,mat(0x929b91,.35,.55),12);
      hub.rotation.x=Math.PI/2;
    }
    const lampMat=new THREE.MeshStandardMaterial({color:0xfff0bd,emissive:0x6b5530,emissiveIntensity:.3});
    for(const z of [-W*.31,W*.31]) box(group,L*.505,.55,z,.06,.12,.19,lampMat,false,false);
    const tailMat=mat(0xc94c3e,.4);
    for(const z of [-W*.31,W*.31]) box(group,-L*.505,.55,z,.06,.12,.18,tailMat,false,false);
    // Model-specific cues: raised off-road stance, sedan boot, or square utility body.
    if(spec.kind==='offroad'||spec.kind==='boxy') {
      for(const wx of [-wheelBase,wheelBase]) for(const wz of [-wheelOffset,wheelOffset]) {
        const flare=new THREE.Mesh(new THREE.TorusGeometry(wheelRadius*.94,.055,5,12,Math.PI),bodyMat);
        flare.rotation.set(Math.PI/2,0,wx<0?Math.PI:0); flare.position.set(wx,.42,wz); group.add(flare);
      }
      if(spec.kind==='offroad') box(group,-L*.51,.8,0,.08,.56,.14,trimMat);
    }
    if(spec.kind==='sedan'||spec.kind==='luxury') box(group,-L*.38,.7,0,L*.12,.07,W*.78,bodyMat);
    if(isPlayer) {
      const glow=new THREE.Mesh(new THREE.ConeGeometry(1.05,2.8,32,1,true),new THREE.MeshBasicMaterial({color:0xc8f36a,transparent:true,opacity:.095,side:THREE.DoubleSide,depthWrite:false}));
      glow.rotation.z=-Math.PI/2; glow.position.set(L*.5,.12,0); group.add(glow);
    }
    group.userData.length=L; group.userData.width=W; return group;
  }
  function addCockpit(spec) {
    const dims={hatch:[2.45,1.18,1.35],sedan:[2.8,1.13,1.34],crossover:[2.65,1.32,1.52],offroad:[2.8,1.42,1.58],suv:[2.95,1.45,1.62],luxury:[3.05,1.39,1.65],boxy:[2.86,1.5,1.62]}[spec.kind] || [2.7,1.25,1.5];
    const width=dims[2]*spec.size;
    const interior=new THREE.Group();
    const dash=mat(0x252d2b,.58), soft=mat(0x46514b,.65), highlight=mat(0xc8f36a,.35,.1);
    box(interior,.32,.91,0,.42,.18,width*.94,dash,false,false);
    box(interior,.61,.8,0,.72,.12,width*.8,mat(spec.color,.4,.12),false,false);
    box(interior,.08,1.02,0,.11,.08,width*.88,soft,false,false);
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(.22,.035,8,24),soft);
    wheel.rotation.y=Math.PI/2;wheel.position.set(-.03,1.01,-width*.22);interior.add(wheel);
    const hub=new THREE.Mesh(new THREE.SphereGeometry(.055,10,8),highlight);hub.position.set(-.03,1.01,-width*.22);interior.add(hub);
    for(let i=0;i<3;i++) {
      const spoke=box(interior,-.03,1.01,-width*.22,.035,.23,.025,soft,false,false);
      spoke.rotation.x=i*Math.PI*2/3;
    }
    box(interior,.04,1.2,0,.075,.09,width*.8,soft,false,false);
    return interior;
  }

  function clearLot() {
    lot.clear(); staticColliders.length=0; obstacles.length=0; cones.length=0;
  }
  function buildEnvironment() {
    clearLot();
    const floor=box(lot,0,-.16,0,29,.28,19,asphalt,false,true); floor.receiveShadow=true;
    // Lot perimeter and planted islands.
    for(const z of [-9.1,9.1]) box(lot,0,.02,z,28,.26,.38,curbMat);
    for(const x of [-14.1,14.1]) box(lot,.0+x,.02,0,.38,.26,18.3,curbMat);
    for(let i=0;i<8;i++) {
      const x=-12.3+i*3.5;
      box(lot,x,.02,-8.25,2.35,.2,.9,mat(0x465747));
      addTree(x,-8.25,.48+(i%3)*.07);
    }
    // Parking lines top and bottom; lower bay is the current destination.
    for(const x of slotXs) {
      addLine(x-1.42,0,.035,17.1); addLine(x+1.42,0,.035,17.1);
      addLine(x,-6,2.85,.035); addLine(x,6,2.85,.035);
    }
    addLine(0,-8.4,26,.035); addLine(0,8.4,26,.035);
    // Central lane dashes and entrance crossing.
    for(let x=-12.1;x<12.5;x+=3.2) addLine(x,0,1.55,.055,mat(0xc2c9b8),.025);
    for(let i=0;i<5;i++) addLine(-12.2+i*.42,-1.5,.12,1.4,mat(0xe1dfc8),.027);
    // Lamp posts around the lot.
    for(const x of [-11,0,11]) {
      cylinder(lot,x,.9,-7.45,.055,1.8,mat(0x68726c),8);
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.12,10,8),new THREE.MeshStandardMaterial({color:0xffe6aa,emissive:0xffc85d,emissiveIntensity:1.3}));
      bulb.position.set(x,1.85,-7.45); lot.add(bulb);
    }
    // Quiet edge landscaping and corner markers.
    for(const x of [-13.25,13.25]) for(const z of [-7.8,7.8]) cylinder(lot,x,.23,z,.22,.46,mat(0xe7845d),8);
    addLotSign();
    buildLevelObjects();
  }
  function addObstacle(x,z,specIndex,colorOverride) {
    const base=carSpecs[specIndex%carSpecs.length];
    const model=addCarModel({...base,color:colorOverride ?? base.color},false);
    model.position.set(x,0,z); model.rotation.y=-Math.PI/2;
    lot.add(model); obstacles.push({x,z,r:model.userData.radius,model});
  }
  function addCone(x,z) {
    const g=new THREE.Group(); g.position.set(x,0,z); lot.add(g);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(.22,.26,.12,12),mat(0xe8dfc7)); base.position.y=.07; g.add(base);
    const cone=new THREE.Mesh(new THREE.CylinderGeometry(.035,.18,.48,10),mat(0xe98158)); cone.position.y=.36; cone.castShadow=true; g.add(cone);
    const band=new THREE.Mesh(new THREE.CylinderGeometry(.105,.13,.08,10),mat(0xf4ddba)); band.position.y=.35; g.add(band);
    cones.push({x,z,r:.38,model:g});
  }
  function addBarrier(x,z,rotation=0) {
    const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotation;lot.add(g);
    box(g,0,.5,0,2.1,.75,.22,mat(0xd4d0bd));
    for(let i=-1;i<=1;i++) {const stripe=box(g,i*.57,.5,.12,.22,.76,.025,mat(0xe98056));stripe.rotation.z=-.42;}
    staticColliders.push({x,z,r:1.2});
  }
  function buildLevelObjects() {
    const spec=levelsForIndex(levelIndex), targetX=targetXs[levelIndex];
    targetMarker=new THREE.Group(); targetMarker.position.set(targetX,.015,6.12); lot.add(targetMarker);
    const pulseMat=new THREE.MeshBasicMaterial({color:0xc8f36a,transparent:true,opacity:.19,side:THREE.DoubleSide});
    const fill=new THREE.Mesh(new THREE.PlaneGeometry(spec.width,4.5),pulseMat);fill.rotation.x=-Math.PI/2;targetMarker.add(fill);
    const lineMat=new THREE.MeshBasicMaterial({color:0xc8f36a,transparent:true,opacity:.9});
    const w=spec.width,d=4.5;
    for(const [x,z,sx,sz] of [[-w/2,0,.055,d],[w/2,0,.055,d],[0,-d/2,w,.055],[0,d/2,w,.055]]) box(targetMarker,x,.035,z,sx,.028,sz,lineMat,false,false);
    // Cars fill every parking space except the destination.
    slotXs.forEach((x,i)=>{
      // Keep the destination bay open on both parking rows.
      if(Math.abs(x-targetX)<.1)return;
      addObstacle(x,-6,i%5,i%2?0xa9bbb0:undefined);
      if(i<7) addObstacle(x,6,(i+2)%7,i%3?undefined:0xc6b49b);
    });
    // Escalating lane clutter, tighter target and an increasing accuracy requirement.
    if(levelIndex>=2) { addCone(-3.2,0); addCone(-.3,1.9); addCone(2.4,-1.6); }
    if(levelIndex>=3) { addObstacle(-1.5,-3.15,1,0x82999b); addObstacle(5.1,-2.8,2,0x9b9383); }
    if(levelIndex>=5) { addBarrier(-5.3,1.4,.15); addBarrier(3.2,-1.5,-.15); addCone(8.7,1.3); }
    if(levelIndex>=6) { addObstacle(-6.3,3.8,4,0x9aabb1); addCone(0,3.8); addCone(6.2,-.4); }
    if(levelIndex>=7) { addBarrier(targetX-2.7,3.2,0); addBarrier(targetX+2.7,3.2,0); }
    ui.objective.textContent=`Park the ${carSpecs[selectedCar].name} in the highlighted bay`;
  }
  function levelName(index) {
    const base=levelNames[index%levelNames.length];
    const tour=Math.floor(index/levelNames.length)+1;
    return tour===1?base:`TOUR ${String(tour).padStart(2,'0')} · ${base}`;
  }
  function levelHint(index) {
    const base=levelHints[index%levelHints.length];
    const tour=Math.floor(index/levelHints.length)+1;
    return tour===1?base:`Course ${tour} raises the pressure. ${base}`;
  }
  function levelsForIndex(index) {
    return {
      width:Math.max(2.48,3.15-index*.0125),
      angleTolerance:Math.max(.105,.24-index*.0027),
      speedLimit:Math.max(1.05,2.3-index*.025)
    };
  }

  function saveProgress() {
    try { localStorage.setItem('parkit-progress',JSON.stringify({highestLevel,selectedCar})); } catch {}
  }
  function renderGarage() {
    ui.garage.innerHTML=''; unlockedCars=Math.max(1,Math.min(carSpecs.length,highestLevel+1));
    selectedCar=Math.min(selectedCar,unlockedCars-1);
    ui.garageCount.textContent=`${String(unlockedCars).padStart(2,'0')} / ${String(carSpecs.length).padStart(2,'0')}`;
    carSpecs.forEach((car,index)=>{
      const button=document.createElement('button');
      button.type='button';button.className=`car-card${index===selectedCar?' selected':''}`;button.disabled=index>=unlockedCars;
      button.setAttribute('aria-label',index<unlockedCars?`Select ${car.name}`:`${car.name}, unlock at level ${index}`);
      button.innerHTML=`<span class="car-emoji">${car.emoji}</span>${car.name}${index>=unlockedCars?'<span class="lock-mark">🔒</span>':''}`;
      button.addEventListener('click',()=>{if(index>=unlockedCars)return;selectedCar=index;saveProgress();renderGarage();setupPlayerModel();ui.objective.textContent=`Park the ${carSpecs[selectedCar].name} in the highlighted bay`;showToast(`${car.name.toUpperCase()} SELECTED`);});
      ui.garage.append(button);
    });
  }
  function setupPlayerModel() {
    if(playerRoot) scene.remove(playerRoot);
    playerRoot=new THREE.Group();playerModel=addCarModel(carSpecs[selectedCar],true);cockpitModel=addCockpit(carSpecs[selectedCar]);
    playerRoot.add(playerModel,cockpitModel);scene.add(playerRoot);
    syncPlayer();updateCameraVisibility();
  }
  function updateCameraVisibility() {
    if(playerModel)playerModel.visible=cameraMode!==1&&(!player||player.bumpFlash<=0);
    if(cockpitModel)cockpitModel.visible=cameraMode===1;
    const names=['CHASE','DRIVER','TOP'];
    ui.camera.setAttribute('aria-label',`Camera view: ${names[cameraMode]}. Click to change.`);
    ui.camera.innerHTML=`◉ <span>${names[cameraMode]}</span>`;
  }
  function syncPlayer() { if(playerRoot&&player){playerRoot.position.set(player.x,0,player.z);playerRoot.rotation.y=-player.angle;} }
  function setupLevel(resetBumps=false) {
    if(resetBumps)bumps=0;
    player={x:-10.8,z:0,angle:0,v:0,steer:0,bumpFlash:0};elapsed=0;parkingProgress=0;completed=false;paused=false;
    ui.level.textContent=String(levelIndex+1).padStart(2,'0');
    ui.subtitle.textContent=`${levelName(levelIndex)} — ${levelHint(levelIndex)}`;
    ui.complete.classList.remove('show');ui.pause.textContent='Ⅱ';ui.hint.classList.remove('hidden');
    buildEnvironment();
    if(!playerRoot)setupPlayerModel(); else syncPlayer();
    updateDashboard();showToast(levelName(levelIndex),1350);
  }
  function showToast(message,duration=1100) {ui.toast.textContent=message;ui.toast.classList.add('show');toastTimer=duration;}
  function updateDashboard() {
    if(!player)return;
    const kmh=Math.round(Math.abs(player.v)*7.5);
    ui.speed.textContent=String(kmh).padStart(2,'0');ui.speedFill.style.width=`${Math.min(kmh/55*100,100)}%`;
    ui.gear.textContent=Math.abs(player.v)<.1?'P':player.v<0?'R':'D';ui.gearCaption.textContent=Math.abs(player.v)<.1?'PARKED':player.v<0?'REVERSE':'DRIVE';
    const minutes=Math.floor(elapsed/60),seconds=Math.floor(elapsed%60);ui.time.textContent=`${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
    ui.bumps.innerHTML=`${bumps}<span class="bump-limit"> / 3</span>`;
    ui.status.textContent=completed?'COMPLETE':paused?'PAUSED':Math.abs(player.v)<.08?'READY':'IN MOTION';ui.status.style.color=bumps>=2?'#ff9d87':'';
  }
  function collide() {
    const pRadius=playerModel?.userData.radius ?? 1.2;
    if(player.x < -12.9+pRadius*.3 || player.x > 12.9-pRadius*.3 || player.z < -8.0+pRadius*.3 || player.z > 8.0-pRadius*.3)return true;
    for(const item of obstacles) if(Math.hypot(player.x-item.x,player.z-item.z)<pRadius+item.r-.48)return true;
    for(const item of staticColliders) if(Math.hypot(player.x-item.x,player.z-item.z)<pRadius+item.r-.25)return true;
    for(const item of cones) if(Math.hypot(player.x-item.x,player.z-item.z)<pRadius+item.r-.4)return true;
    return false;
  }
  function angleDiff(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
  function checkParking(dt) {
    const targetX=targetXs[levelIndex], target=levelsForIndex(levelIndex);
    const centered=Math.abs(player.x-targetX)<Math.max(.5,target.width*.25) && Math.abs(player.z-6.12)<.48;
    const aligned=Math.abs(angleDiff(player.angle,Math.PI/2))<target.angleTolerance;
    if(centered&&aligned&&Math.abs(player.v)<target.speedLimit) {parkingProgress+=dt;ui.status.textContent='HOLD STEADY';if(parkingProgress>.85)finishLevel();}
    else parkingProgress=Math.max(0,parkingProgress-dt*1.6);
    if(targetMarker) targetMarker.children[0].material.opacity=.12+Math.sin(performance.now()/260)*.05;
  }
  function finishLevel() {
    if(completed)return;
    completed=true;player.v=0;
    const score=Math.max(0,100-Math.round(elapsed*1.2)-bumps*12);
    const oldUnlocked=Math.min(carSpecs.length,highestLevel+1);
    highestLevel=Math.max(highestLevel,Math.min(MAX_LEVELS-1,levelIndex+1));
    const unlocked=Math.min(carSpecs.length,highestLevel+1);
    const finalLevel=levelIndex===MAX_LEVELS-1;
    renderGarage();saveProgress();
    if(unlocked>oldUnlocked) {ui.completeKicker.textContent='NEW CAR UNLOCKED';ui.completeTitle.textContent=`Meet the ${carSpecs[unlocked-1].name}.`;}
    else {ui.completeKicker.textContent=finalLevel?'PARKING CHAMPION':'NICE PARKING';ui.completeTitle.textContent=finalLevel?'All 50 levels cleared.':'Right on the mark.';}
    ui.completeText.textContent=`${finalLevel?'You mastered every bay.':levelHint(levelIndex)}  •  ${score}% parking score`;
    ui.next.innerHTML=finalLevel?'DRIVE AGAIN <span>↻</span>':'NEXT LEVEL <span>→</span>';
    ui.complete.classList.add('show');updateDashboard();playTone(660,.12);setTimeout(()=>playTone(880,.16),120);
  }
  function playTone(freq,duration=.08) {
    if(!soundOn)return;
    try{audioContext??=new AudioContext();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.frequency.value=freq;osc.type='sine';gain.gain.setValueAtTime(.035,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration);}catch{}
  }
  function update(dt) {
    if(!paused&&!completed) {
      elapsed+=dt;
      const forward=keys.has('w')||keys.has('arrowup')||keys.has('forward');
      const reverse=keys.has('s')||keys.has('arrowdown')||keys.has('reverse');
      const left=keys.has('a')||keys.has('arrowleft')||keys.has('left');
      const right=keys.has('d')||keys.has('arrowright')||keys.has('right');
      const brake=keys.has(' ')||keys.has('brake');
      const before={x:player.x,z:player.z,angle:player.angle};
      const steerInput=(right?1:0)-(left?1:0);
      const sizeFactor=1/Math.sqrt(carSpecs[selectedCar].size);
      const braking=reverse||brake;
      if(braking&&player.v>.04)player.v=Math.max(0,player.v-(brake?10:8.5)*dt);
      else if(forward&&player.v<-.04)player.v=Math.min(0,player.v+8.5*dt);
      else if(reverse&&player.v<=.04)player.v=Math.max(-2.9,player.v-2.8*sizeFactor*dt);
      else if(forward&&player.v>=-.04)player.v=Math.min(6.6*sizeFactor,player.v+4.4*sizeFactor*dt);
      else player.v*=Math.pow(brake?.91:.985,dt*60);
      player.steer+=(steerInput-player.steer)*Math.min(1,dt*8);
      const speed=Math.abs(player.v), handbrake=keys.has(' ')||keys.has('brake');
      const yawRate=handbrake?1.15:0.28+Math.min(speed,4.5)*.24;
      player.angle+=player.steer*yawRate*dt*(player.v<-.04?-1:1);
      if(handbrake)player.v*=Math.pow(.965,dt*60);
      player.x+=Math.cos(player.angle)*player.v*dt;
      player.z+=Math.sin(player.angle)*player.v*dt;
      player.bumpFlash=Math.max(0,player.bumpFlash-dt);
      if(collide()) {
        player.x=before.x;player.z=before.z;player.angle=before.angle;player.v=0;player.bumpFlash=.5;
        bumps++;playTone(130,.1);showToast(bumps>=3?'OOPS — TRY AGAIN':'BUMP! TAKE IT SLOW',1150);
        if(bumps>=3)setTimeout(()=>{if(bumps>=3){bumps=0;setupLevel(false);showToast('FRESH START — YOU GOT THIS',1400);}},900);
      } else checkParking(dt);
      if(Math.abs(player.v)>.2)ui.hint.classList.add('hidden');
      syncPlayer();
      if(playerModel)playerModel.visible=cameraMode!==1&&(player.bumpFlash<=0||Math.floor(player.bumpFlash*16)%2===0);
      if(cockpitModel)cockpitModel.visible=cameraMode===1;
    }
    if(toastTimer>0){toastTimer-=dt*1000;if(toastTimer<=0)ui.toast.classList.remove('show');}
    updateDashboard();
  }
  const cameraTarget=new THREE.Vector3(0,0,0), desiredCamera=new THREE.Vector3();
  function render(now) {
    const aspect=canvas.clientWidth/Math.max(1,canvas.clientHeight);
    if(canvas.width!==Math.round(canvas.clientWidth*renderer.getPixelRatio())||canvas.height!==Math.round(canvas.clientHeight*renderer.getPixelRatio()))renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);
    camera.aspect=aspect;camera.updateProjectionMatrix();
    if(cameraMode===1&&player&&playerRoot) {
      const width=playerModel?.userData.width||1.4;
      const driverPos=playerRoot.localToWorld(new THREE.Vector3(-.12,1.31,-width*.2));
      const forwardX=Math.cos(player.angle),forwardZ=Math.sin(player.angle);
      camera.position.lerp(driverPos,.38);
      cameraTarget.set(driverPos.x+forwardX*18,driverPos.y+.08,driverPos.z+forwardZ*18);
      camera.lookAt(cameraTarget);
    } else {
      const followX=player?player.x:0,followZ=player?player.z:0;
      if(cameraMode===2)desiredCamera.set(followX,31,followZ+1.5);
      else if(player)desiredCamera.set(player.x-Math.cos(player.angle)*15,9.5,player.z-Math.sin(player.angle)*15);
      else desiredCamera.set(0,25,23);
      camera.position.lerp(desiredCamera,cameraMode===2?.07:.065);
      cameraTarget.set(followX,.65,followZ);camera.lookAt(cameraTarget);
    }
    renderer.render(scene,camera);
  }
  function loop(now) {const dt=Math.min((now-lastTime)/1000,.04);lastTime=now;update(dt);render(now);requestAnimationFrame(loop);}
  function togglePause(){if(completed)return;paused=!paused;ui.pause.textContent=paused?'▶':'Ⅱ';showToast(paused?'PAUSED — PRESS SPACE TO RESUME':'BACK TO THE LOT',1100);updateDashboard();}
  function cycleCamera(){cameraMode=(cameraMode+1)%3;updateCameraVisibility();showToast(`${['CHASE','DRIVER','TOP'][cameraMode]} CAMERA`,850);}

  window.addEventListener('keydown',event=>{
    const key=event.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))event.preventDefault();keys.add(key);
    if(key===' '&&!event.repeat&&paused)togglePause();if(key==='r'&&!event.repeat)setupLevel(true);if(key==='c'&&!event.repeat)cycleCamera();if((key==='escape'||key==='p')&&!event.repeat)togglePause();
  });
  window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
  document.querySelectorAll('[data-control]').forEach(button=>{
    const name=button.dataset.control;
    const down=event=>{event.preventDefault();keys.add(name);button.classList.add('active');try{button.setPointerCapture(event.pointerId);}catch{}};
    const up=event=>{event.preventDefault();keys.delete(name);button.classList.remove('active');};
    button.addEventListener('pointerdown',down);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);
  });
  ui.restart.addEventListener('click',()=>setupLevel(true));ui.pause.addEventListener('click',togglePause);
  ui.next.addEventListener('click',()=>{levelIndex=levelIndex===MAX_LEVELS-1?0:Math.min(levelIndex+1,highestLevel);setupLevel(true);});
  ui.sound.addEventListener('click',()=>{soundOn=!soundOn;ui.sound.classList.toggle('sound-on',soundOn);ui.sound.innerHTML=`♫ <span>${soundOn?'ON':'SOUND'}</span>`;if(soundOn)playTone(520,.08);});
  ui.camera.addEventListener('click',cycleCamera);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)keys.clear();});
  renderGarage();setupLevel(true);requestAnimationFrame(loop);
})();
