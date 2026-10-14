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
    { id:'mdf', name:'MDF', meta:'Board material', swatch:'#c6aa82' },
    { id:'plywood', name:'Plywood', meta:'Board material', swatch:'#cfae7a' },
    { id:'hpl', name:'HPL', meta:'Decorative surface', swatch:'#b7a898' },
    { id:'ceramic', name:'Ceramic', meta:'Slab / worktop', swatch:'#ddd9cf' },
    { id:'tile', name:'Tiles', meta:'Wall / floor', swatch:'#d9d7d0' },
    { id:'flooring', name:'Flooring', meta:'Wood / laminate', swatch:'#a98766' }
  ]
};

export function uid(prefix='id'){
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
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
    room:{ walls:[], openings:[], obstacles:[] },
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
  p.room=p.room||{walls:[],openings:[],obstacles:[]};
  p.room.walls=Array.isArray(p.room.walls)?p.room.walls:[];
  p.room.openings=Array.isArray(p.room.openings)?p.room.openings:[];
  p.room.obstacles=Array.isArray(p.room.obstacles)?p.room.obstacles:[];
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
    if(hit){
      wall[key].x=hit.point.x;
      wall[key].y=hit.point.y;
    }
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
  }else{
    w.end.x=target.x;w.end.y=target.y;
  }
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
  const targets=[
    ['start',{x:w.start.x+dx,y:w.start.y+dy}],
    ['end',{x:w.end.x+dx,y:w.end.y+dy}]
  ];
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
