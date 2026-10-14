export const STORAGE_KEY = 'kitchen-studio-project-v2';

export const CATALOG = {
  cabinets: [
    { id:'base-door', name:'Base · 1 door', meta:'Parametric cabinet', swatch:'#d9d4c8' },
    { id:'base-double', name:'Base · 2 doors', meta:'Parametric cabinet', swatch:'#d9d4c8' },
    { id:'base-drawers', name:'Base · drawers', meta:'2 / 3 / 4 drawers', swatch:'#d4cec0' },
    { id:'tall-pantry', name:'Tall · pantry', meta:'Full height', swatch:'#cbc5b8' },
    { id:'tall-oven', name:'Tall · oven', meta:'Appliance housing', swatch:'#c6c1b7' },
    { id:'upper-door', name:'Upper · door', meta:'Vertical front', swatch:'#e2ddd2' },
    { id:'upper-horizontal', name:'Upper · horizontal', meta:'Lift-up / flap', swatch:'#e2ddd2' },
    { id:'corner', name:'Corner', meta:'L / blind corner', swatch:'#d0cabd' }
  ],
  appliances: [
    { id:'oven', name:'Built-in oven', meta:'Manufacturer-ready', swatch:'#343936' },
    { id:'hob', name:'Cooking hob', meta:'Technical cut-out', swatch:'#2c312f' },
    { id:'fridge', name:'Refrigerator', meta:'Built-in / freestanding', swatch:'#b9bbb6' },
    { id:'dishwasher', name:'Dishwasher', meta:'Built-in', swatch:'#c7c8c4' },
    { id:'hood', name:'Extractor', meta:'Wall / integrated', swatch:'#afb2ad' },
    { id:'sink', name:'Sink', meta:'Top / under mount', swatch:'#9fa8a2' }
  ],
  materials: [
    { id:'mdf', name:'MDF', meta:'Board material', swatch:'#c6aa82', kind:'board' },
    { id:'plywood', name:'Plywood', meta:'Board material', swatch:'#cfae7a', kind:'board' },
    { id:'hpl', name:'HPL', meta:'Decorative surface', swatch:'#b7a898', kind:'surface' },
    { id:'ceramic', name:'Ceramic', meta:'Slab / worktop', swatch:'#ddd9cf', kind:'surface' },
    { id:'tile', name:'Tiles', meta:'Wall / floor', swatch:'#d9d7d0', kind:'floor' },
    { id:'flooring', name:'Flooring', meta:'Wood / laminate', swatch:'#a98766', kind:'floor' },
    { id:'paint-white', name:'Ceiling paint', meta:'Matt white', swatch:'#f4f1e9', kind:'ceiling' }
  ],
  lighting: [
    { id:'pendant', name:'Pendant / chandelier', meta:'Ceiling suspended', swatch:'#8f816b', fixtureType:'pendant', diameter:420, drop:700, lumens:1200, kelvin:3000 },
    { id:'downlight', name:'Downlight', meta:'Recessed ceiling light', swatch:'#d8d5cd', fixtureType:'downlight', diameter:90, drop:20, lumens:700, kelvin:3000 },
    { id:'spot', name:'Spotlight', meta:'Directional ceiling spot', swatch:'#9d9b94', fixtureType:'spot', diameter:110, drop:100, lumens:850, kelvin:3000 },
    { id:'track', name:'Track light', meta:'Track-mounted fixture', swatch:'#4a4d49', fixtureType:'track', diameter:100, drop:140, lumens:900, kelvin:3000 },
    { id:'linear', name:'Linear light', meta:'Linear pendant / ceiling', swatch:'#b4afa3', fixtureType:'linear', diameter:900, drop:650, lumens:1800, kelvin:3000 },
    { id:'led-strip', name:'LED strip', meta:'Cove / under-cabinet', swatch:'#e7d29c', fixtureType:'strip', diameter:1200, drop:0, lumens:1000, kelvin:3000 }
  ]
};

export function uid(prefix='id'){
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
}

function defaultSurfaces(){
  return {
    floor:{
      enabled:false,
      materialId:'tile',
      colour:'#d9d7d0',
      pattern:'tile',
      tileWidth:600,
      tileHeight:1200,
      rotation:0,
      grout:2,
      waste:10
    },
    ceiling:{
      enabled:false,
      materialId:'paint-white',
      colour:'#f4f1e9',
      thickness:20,
      visible3d:false
    }
  };
}

export function newProject(){
  return {
    version:2,
    name:'Untitled Kitchen',
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    settings:{
      primaryUnit:'mm',
      secondaryInches:false,
      ceilingHeight:2600,
      defaultWallThickness:100,
      grid:100,
      snap:50
    },
    room:{
      walls:[],
      openings:[],
      obstacles:[],
      surfaces:defaultSurfaces(),
      lighting:[]
    },
    kitchen:{ objects:[], runs:[] },
    catalog:{ customMaterials:[], customAppliances:[] },
    floorPlan:null
  };
}

export function clone(value){ return JSON.parse(JSON.stringify(value)); }

function samePoint(a,b,tolerance=.5){
  return Math.hypot(a.x-b.x,a.y-b.y)<=tolerance;
}

function migrateWallConnections(project){
  const walls=project.room.walls;
  for(const w of walls){
    w.connectionMode=w.connectionMode==='independent'?'independent':'connected';
    w.locked=!!w.locked;
    if(!w.startJointId) w.startJointId=uid('joint');
    if(!w.endJointId) w.endJointId=uid('joint');
  }
  const endpoints=[];
  for(const w of walls){
    if(w.connectionMode!=='connected') continue;
    endpoints.push({wall:w,key:'start',point:w.start});
    endpoints.push({wall:w,key:'end',point:w.end});
  }
  for(let i=0;i<endpoints.length;i++){
    for(let j=0;j<i;j++){
      if(samePoint(endpoints[i].point,endpoints[j].point)){
        const id=endpoints[j].wall[`${endpoints[j].key}JointId`];
        endpoints[i].wall[`${endpoints[i].key}JointId`]=id;
        break;
      }
    }
  }
}

export function normalizeProject(value){
  if(!value || value.version!==2) throw new Error('This file is not a Kitchen Studio v2 project.');
  const p=clone(value);
  p.name=String(p.name||'Untitled Kitchen').slice(0,120);
  p.settings={...newProject().settings,...(p.settings||{})};
  p.room=p.room||{};
  p.room.walls=Array.isArray(p.room.walls)?p.room.walls:[];
  p.room.openings=Array.isArray(p.room.openings)?p.room.openings:[];
  p.room.obstacles=Array.isArray(p.room.obstacles)?p.room.obstacles:[];
  const defaults=defaultSurfaces();
  p.room.surfaces=p.room.surfaces||{};
  p.room.surfaces.floor={...defaults.floor,...(p.room.surfaces.floor||{})};
  p.room.surfaces.ceiling={...defaults.ceiling,...(p.room.surfaces.ceiling||{})};
  p.room.lighting=Array.isArray(p.room.lighting)?p.room.lighting:[];
  p.kitchen=p.kitchen||{objects:[],runs:[]};
  p.kitchen.objects=Array.isArray(p.kitchen.objects)?p.kitchen.objects:[];
  p.kitchen.runs=Array.isArray(p.kitchen.runs)?p.kitchen.runs:[];
  p.catalog=p.catalog||{customMaterials:[],customAppliances:[]};
  migrateWallConnections(p);
  return p;
}

function endpointRecords(project){
  const out=[];
  for(const w of project.room.walls){
    out.push({wall:w,key:'start',jointId:w.startJointId,point:w.start});
    out.push({wall:w,key:'end',jointId:w.endJointId,point:w.end});
  }
  return out;
}

function findJointAt(project,point,threshold=1,excludeWallId=null){
  let best=null,bestD=Infinity;
  for(const e of endpointRecords(project)){
    if(e.wall.id===excludeWallId || e.wall.connectionMode!=='connected') continue;
    const d=Math.hypot(e.point.x-point.x,e.point.y-point.y);
    if(d<=threshold && d<bestD){best=e;bestD=d;}
  }
  return best;
}

export function jointDegree(project,jointId){
  if(!jointId) return 0;
  let n=0;
  for(const e of endpointRecords(project)){
    if(e.wall.connectionMode==='connected' && e.jointId===jointId) n++;
  }
  return n;
}

export function endpointConnected(project,wall,key){
  if(wall.connectionMode!=='connected') return false;
  return jointDegree(project,wall[`${key}JointId`])>1;
}

function jointLocked(project,jointId){
  return endpointRecords(project).some(e=>e.jointId===jointId && e.wall.locked);
}

export function moveJoint(project,jointId,point){
  if(!jointId || jointLocked(project,jointId)) return false;
  let moved=false;
  for(const e of endpointRecords(project)){
    if(e.jointId!==jointId || e.wall.connectionMode!=='connected') continue;
    e.point.x=point.x;
    e.point.y=point.y;
    moved=true;
  }
  return moved;
}

export function setWallConnection(project,wall,mode){
  if(mode==='independent'){
    wall.connectionMode='independent';
    wall.startJointId=uid('joint');
    wall.endJointId=uid('joint');
    return;
  }
  wall.connectionMode='connected';
  for(const key of ['start','end']){
    const hit=findJointAt(project,wall[key],1,wall.id);
    wall[`${key}JointId`]=hit?.jointId||uid('joint');
    if(hit){wall[key].x=hit.point.x;wall[key].y=hit.point.y;}
  }
}

export function addWall(project,start,end,opts={}){
  const mode=opts.connectionMode==='independent'?'independent':'connected';
  const startHit=mode==='connected'?findJointAt(project,start,Math.max(1,project.settings.snap||50),null):null;
  const endHit=mode==='connected'?findJointAt(project,end,Math.max(1,project.settings.snap||50),null):null;
  const wall={
    id:uid('wall'), type:'line',
    start:{x:startHit?.point.x ?? start.x,y:startHit?.point.y ?? start.y},
    end:{x:endHit?.point.x ?? end.x,y:endHit?.point.y ?? end.y},
    startJointId:startHit?.jointId||uid('joint'),
    endJointId:endHit?.jointId||uid('joint'),
    connectionMode:mode,
    locked:!!opts.locked,
    thickness:Number(opts.thickness ?? project.settings.defaultWallThickness ?? 100),
    height:Number(opts.height ?? project.settings.ceilingHeight ?? 2600)
  };
  project.room.walls.push(wall);
  project.updatedAt=new Date().toISOString();
  return wall;
}

export function wallLength(w){ return Math.hypot(w.end.x-w.start.x,w.end.y-w.start.y); }

export function setWallLength(project,w,length){
  if(w.locked) return false;
  const old=wallLength(w); if(old<0.0001) return false;
  const ux=(w.end.x-w.start.x)/old, uy=(w.end.y-w.start.y)/old;
  const target={x:w.start.x+ux*length,y:w.start.y+uy*length};
  if(w.connectionMode==='connected' && w.endJointId){
    if(jointLocked(project,w.endJointId)) return false;
    moveJoint(project,w.endJointId,target);
  }else{w.end.x=target.x;w.end.y=target.y;}
  return true;
}

export function setWallEndpoint(project,w,key,point){
  if(w.locked) return false;
  const jointId=w[`${key}JointId`];
  if(w.connectionMode==='connected' && jointId){
    if(jointLocked(project,jointId)) return false;
    return moveJoint(project,jointId,point);
  }
  w[key].x=point.x;w[key].y=point.y;
  return true;
}

export function translateWall(project,w,dx,dy){
  if(w.locked) return false;
  const targets=[['start',{x:w.start.x+dx,y:w.start.y+dy}],['end',{x:w.end.x+dx,y:w.end.y+dy}]];
  for(const [key] of targets){
    const jid=w[`${key}JointId`];
    if(w.connectionMode==='connected' && jid && jointLocked(project,jid)) return false;
  }
  for(const [key,p] of targets) setWallEndpoint(project,w,key,p);
  return true;
}

export function snapValue(v,step=50){ return Math.round(v/step)*step; }

export function snapPoint(p,project,threshold=120){
  let best={x:snapValue(p.x,project.settings.snap),y:snapValue(p.y,project.settings.snap)};
  let bestDist=Infinity;
  for(const w of project.room.walls){
    for(const n of [w.start,w.end]){
      const d=Math.hypot(n.x-p.x,n.y-p.y);
      if(d<threshold && d<bestDist){ best={x:n.x,y:n.y}; bestDist=d; }
    }
  }
  return best;
}

export function boundsOfWalls(walls){
  if(!walls.length) return {minX:-2000,minY:-1500,maxX:2000,maxY:1500};
  const xs=[],ys=[];
  for(const w of walls){ xs.push(w.start.x,w.end.x); ys.push(w.start.y,w.end.y); }
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const pad=Math.max(1000,Math.max(maxX-minX,maxY-minY)*0.25);
  return {minX:minX-pad,minY:minY-pad,maxX:maxX+pad,maxY:maxY+pad};
}

export function roomPolygon(project){
  const walls=project.room.walls.filter(w=>w.connectionMode==='connected');
  if(walls.length<3) return null;
  const byJoint=new Map();
  for(const w of walls){
    for(const key of ['start','end']){
      const id=w[`${key}JointId`];
      if(!byJoint.has(id)) byJoint.set(id,[]);
      byJoint.get(id).push({wall:w,key});
    }
  }
  const usable=walls.filter(w=>byJoint.get(w.startJointId)?.length===2 && byJoint.get(w.endJointId)?.length===2);
  if(usable.length<3) return null;
  const first=usable[0];
  const points=[{x:first.start.x,y:first.start.y}];
  let currentWall=first,currentJoint=first.endJointId,currentPoint=first.end,guard=0;
  points.push({x:currentPoint.x,y:currentPoint.y});
  while(currentJoint!==first.startJointId && guard++<usable.length+2){
    const links=(byJoint.get(currentJoint)||[]).filter(e=>e.wall.id!==currentWall.id);
    if(links.length!==1) return null;
    const next=links[0].wall;
    const nextKey=links[0].key;
    const otherKey=nextKey==='start'?'end':'start';
    currentWall=next;
    currentJoint=next[`${otherKey}JointId`];
    currentPoint=next[otherKey];
    points.push({x:currentPoint.x,y:currentPoint.y});
  }
  if(currentJoint!==first.startJointId || points.length<4) return null;
  points.pop();
  return points;
}

export function polygonArea(points){
  if(!points || points.length<3) return 0;
  let sum=0;
  for(let i=0,j=points.length-1;i<points.length;j=i++) sum+=(points[j].x*points[i].y-points[i].x*points[j].y);
  return Math.abs(sum)/2;
}

export function addLight(project,typeId,point){
  const preset=CATALOG.lighting.find(x=>x.id===typeId)||CATALOG.lighting[0];
  const light={
    id:uid('light'),
    typeId:preset.id,
    name:preset.name,
    fixtureType:preset.fixtureType,
    x:point.x,
    y:point.y,
    ceilingHeight:project.settings.ceilingHeight,
    drop:preset.drop,
    diameter:preset.diameter,
    lumens:preset.lumens,
    kelvin:preset.kelvin,
    enabled:true
  };
  project.room.lighting.push(light);
  project.updatedAt=new Date().toISOString();
  return light;
}

export function materialById(id){
  return CATALOG.materials.find(m=>m.id===id)||null;
}

export function parseLength(input){
  if(typeof input==='number') return input;
  const s=String(input).trim().toLowerCase().replace(',','.');
  const m=s.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m|in|inch|inches|ft|feet|')?$/);
  if(!m) return NaN;
  const n=Number(m[1]),u=m[2]||'mm';
  if(u==='mm') return n;
  if(u==='cm') return n*10;
  if(u==='m') return n*1000;
  if(u==='in'||u==='inch'||u==='inches') return n*25.4;
  if(u==='ft'||u==='feet'||u==="'") return n*304.8;
  return NaN;
}

export function formatLength(mm,unit='mm',precision){
  if(!Number.isFinite(mm)) return '—';
  let value=mm,suffix='mm',digits=precision;
  if(unit==='cm'){value=mm/10;suffix='cm';if(digits==null)digits=1;}
  else if(unit==='m'){value=mm/1000;suffix='m';if(digits==null)digits=3;}
  else if(unit==='in'){value=mm/25.4;suffix='in';if(digits==null)digits=2;}
  else if(digits==null)digits=0;
  return `${Number(value.toFixed(digits))} ${suffix}`;
}

export function displayLength(mm,settings){
  const primary=formatLength(mm,settings.primaryUnit||'mm');
  if(settings.secondaryInches && settings.primaryUnit!=='in') return `${primary} · ${formatLength(mm,'in')}`;
  return primary;
}
