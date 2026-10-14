import {StudioRenderer} from './render.mjs';
import {roomPolygon,wallLength} from './model.mjs';

const STORAGE_KEY='kitchen-studio-project-v2';
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

const PRESETS={
  'base-door':{name:'Base · 1 door',kind:'base',width:600,depth:560,height:720,bottom:100,frontType:'door1',frontCount:1},
  'base-double':{name:'Base · 2 doors',kind:'base',width:600,depth:560,height:720,bottom:100,frontType:'door2',frontCount:2},
  'base-drawers':{name:'Base · drawers',kind:'base',width:600,depth:560,height:720,bottom:100,frontType:'drawers',frontCount:3},
  'tall-pantry':{name:'Tall · pantry',kind:'tall',width:600,depth:600,height:2400,bottom:0,frontType:'door1',frontCount:1},
  'tall-oven':{name:'Tall · oven',kind:'tall',width:600,depth:600,height:2400,bottom:0,frontType:'mixed',frontCount:3},
  'upper-door':{name:'Upper · door',kind:'upper',width:600,depth:350,height:720,bottom:1500,frontType:'door1',frontCount:1},
  'upper-horizontal':{name:'Upper · horizontal',kind:'upper',width:600,depth:350,height:720,bottom:1500,frontType:'horizontal',frontCount:1},
  'corner':{name:'Corner',kind:'corner',width:900,depth:900,height:720,bottom:100,frontType:'corner',frontCount:1}
};

const state={
  placing:null,
  selectedId:null,
  targetWallId:null,
  renderer:null,
  hit3d:[],
  kitchenHistory:[]
};

function readProject(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch{return null;}}
function writeProject(p){p.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(p));triggerRedraw();}
function triggerRedraw(){requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));}
function uid(){return 'cab_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);}
function wallById(p,id){return p.room?.walls?.find(w=>w.id===id)||null;}
function cabById(p,id){return p.kitchen?.objects?.find(o=>o.id===id)||null;}
function pushKitchenHistory(p){state.kitchenHistory.push(JSON.stringify(p.kitchen||{objects:[],runs:[]}));if(state.kitchenHistory.length>50)state.kitchenHistory.shift();}
function pointInPolygon(pt,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];const hit=((a.y>pt.y)!==(b.y>pt.y))&&(pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y+1e-9)+a.x);if(hit)inside=!inside;}return inside;}
function distToSegment(pt,a,b){const dx=b.x-a.x,dy=b.y-a.y,L2=dx*dx+dy*dy||1,t=clamp(((pt.x-a.x)*dx+(pt.y-a.y)*dy)/L2,0,1),x=a.x+dx*t,y=a.y+dy*t;return{d:Math.hypot(pt.x-x,pt.y-y),t,x,y};}

function interiorSide(p,w,along){
  const poly=roomPolygon(p);if(!poly)return 1;
  const dx=w.end.x-w.start.x,dy=w.end.y-w.start.y,L=Math.hypot(dx,dy)||1,px=w.start.x+dx*(along/L),py=w.start.y+dy*(along/L),nx=-dy/L,ny=dx/L,s=180;
  if(pointInPolygon({x:px+nx*s,y:py+ny*s},poly))return 1;
  if(pointInPolygon({x:px-nx*s,y:py-ny*s},poly))return -1;
  return 1;
}

function placementOnWall(p,wallId,pt){
  const w=wallById(p,wallId);if(!w)return null;
  const hit=distToSegment(pt,w.start,w.end),L=wallLength(w);
  return{wall:w,d:hit.d,along:hit.t*L,side:interiorSide(p,w,hit.t*L),L};
}

function nearestWall(p,pt){
  let best=null;
  for(const w of p.room?.walls||[]){const h=placementOnWall(p,w.id,pt);if(h&&(!best||h.d<best.d))best=h;}
  return best;
}

function geometry(p,cab){
  const w=wallById(p,cab.wallId);if(!w)return null;
  const dx=w.end.x-w.start.x,dy=w.end.y-w.start.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L;
  let nx=-uy,ny=ux;if((cab.side||1)<0){nx=-nx;ny=-ny;}
  const wallHalf=(w.thickness||100)/2;
  const backX=w.start.x+ux*cab.offset+nx*wallHalf,backY=w.start.y+uy*cab.offset+ny*wallHalf;
  const p0={x:backX,y:backY},p1={x:backX+ux*cab.width,y:backY+uy*cab.width},p2={x:p1.x+nx*cab.depth,y:p1.y+ny*cab.depth},p3={x:p0.x+nx*cab.depth,y:p0.y+ny*cab.depth};
  return{wall:w,ux,uy,nx,ny,L,pts:[p0,p1,p2,p3],frontA:p3,frontB:p2,center:{x:(p0.x+p2.x)/2,y:(p0.y+p2.y)/2}};
}

function intervalsForRun(p,wallId,side,excludeId=null){
  return(p.kitchen?.objects||[]).filter(o=>o.wallId===wallId&&(o.side||1)===side&&o.id!==excludeId).map(o=>[o.offset,o.offset+o.width]).sort((a,b)=>a[0]-b[0]);
}
function snapOffset(p,wallId,side,offset,width,L,excludeId=null){
  const ints=intervalsForRun(p,wallId,side,excludeId);let x=clamp(offset,0,Math.max(0,L-width));const edges=[0,Math.max(0,L-width)];
  for(const[a,b]of ints)edges.push(a-width,b);
  let best=x,bd=110;for(const e of edges){const d=Math.abs(x-e);if(d<bd){best=e;bd=d;}}
  x=clamp(best,0,Math.max(0,L-width));
  const overlaps=()=>ints.some(([a,b])=>x<b-.1&&x+width>a+.1);
  if(overlaps()){
    const gaps=[];let cursor=0;for(const[a,b]of ints){if(a-cursor>=width)gaps.push(cursor);cursor=Math.max(cursor,b);}if(L-cursor>=width)gaps.push(cursor);
    if(!gaps.length)return null;
    x=gaps.reduce((q,g)=>Math.abs(g-offset)<Math.abs(q-offset)?g:q,gaps[0]);
  }
  return x;
}
function syncRuns(p){const map=new Map();for(const o of p.kitchen?.objects||[]){const key=o.runId||`${o.wallId}:${o.side||1}`;if(!map.has(key))map.set(key,{id:key,wallId:o.wallId,side:o.side||1,objectIds:[]});map.get(key).objectIds.push(o.id);}p.kitchen.runs=[...map.values()];}
function runStats(p,cab){
  const w=wallById(p,cab.wallId);if(!w)return null;const L=wallLength(w),objs=(p.kitchen?.objects||[]).filter(o=>o.wallId===cab.wallId&&(o.side||1)===(cab.side||1)&&o.kind!=='upper'),used=objs.reduce((s,o)=>s+o.width,0);return{length:L,used,remaining:L-used};
}

function createCabinet(p,presetId,pt,wallId){
  const preset=PRESETS[presetId],hit=placementOnWall(p,wallId,pt);if(!preset||!hit)return null;
  const offset=snapOffset(p,hit.wall.id,hit.side,hit.along-preset.width/2,preset.width,hit.L);if(offset==null)return null;
  const cab={id:uid(),typeId:presetId,name:preset.name,kind:preset.kind,wallId:hit.wall.id,side:hit.side,runId:`${hit.wall.id}:${hit.side}`,offset,width:preset.width,depth:preset.depth,height:preset.height,bottom:preset.bottom,frontType:preset.frontType,frontCount:preset.frontCount,carcassThickness:18,backThickness:8,frontThickness:18,frontGap:2,materialId:'mdf',locked:false};
  p.kitchen=p.kitchen||{objects:[],runs:[]};p.kitchen.objects=p.kitchen.objects||[];p.kitchen.objects.push(cab);syncRuns(p);return cab;
}

function planHit(p,screen){
  const r=state.renderer;if(!r)return null;
  for(const cab of [...(p.kitchen?.objects||[])].reverse()){const g=geometry(p,cab);if(!g)continue;const pts=g.pts.map(q=>r.worldToScreen(q));if(pointInPolygon(screen,pts))return cab;}
  return null;
}
function wallHitPlan(p,screen){
  const r=state.renderer;if(!r)return null;const world=r.screenToWorld(screen),hit=nearestWall(p,world);if(!hit)return null;
  const pxPerMm=Math.max(.001,r.camera?.zoom||.1);return hit.d*pxPerMm<=18?hit.wall:null;
}

function drawKitchenPlan(renderer,p){
  const c=renderer.ctx;
  for(const cab of p.kitchen?.objects||[]){
    const g=geometry(p,cab);if(!g)continue;const pts=g.pts.map(q=>renderer.worldToScreen(q)),sel=cab.id===state.selectedId;c.save();c.beginPath();c.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(q=>c.lineTo(q.x,q.y));c.closePath();c.fillStyle=sel?'rgba(86,111,77,.52)':cab.kind==='upper'?'rgba(222,216,203,.48)':'rgba(169,155,137,.58)';c.fill();c.strokeStyle=sel?'#355133':'#756e63';c.lineWidth=sel?2:1;c.stroke();const a=renderer.worldToScreen(g.frontA),b=renderer.worldToScreen(g.frontB);c.strokeStyle='#3f473d';c.lineWidth=2;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();const mid=renderer.worldToScreen(g.center);c.fillStyle='#30372f';c.font='9px Inter,sans-serif';c.textAlign='center';c.fillText(`${Math.round(cab.width)}`,mid.x,mid.y+3);c.restore();
  }
}

function drawKitchen3D(renderer,p){
  const walls=p.room?.walls||[];if(!walls.length)return;state.hit3d=[];
  const bb={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};for(const w of walls){for(const q of[w.start,w.end]){bb.minX=Math.min(bb.minX,q.x);bb.maxX=Math.max(bb.maxX,q.x);bb.minY=Math.min(bb.minY,q.y);bb.maxY=Math.max(bb.maxY,q.y);}}
  const center={x:(bb.minX+bb.maxX)/2,y:(bb.minY+bb.maxY)/2},yaw=renderer.camera.yaw,pitch=renderer.camera.pitch,co=Math.cos(yaw),si=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),H=p.settings?.ceilingHeight||2600;
  const raw=(x,y,z)=>{const xx=x-center.x,zz=-(y-center.y),yy=z-H*.35,rx=xx*co-zz*si,rz=xx*si+zz*co;return{x:rx,y:-yy*cp-rz*sp,d:rz*cp-yy*sp};};
  const corners=[];for(const w of walls){for(const q of[w.start,w.end])corners.push(raw(q.x,q.y,0),raw(q.x,q.y,w.height||H));}
  const minX=Math.min(...corners.map(q=>q.x)),maxX=Math.max(...corners.map(q=>q.x)),minY=Math.min(...corners.map(q=>q.y)),maxY=Math.max(...corners.map(q=>q.y)),scale=Math.min((renderer.width-140)/(maxX-minX||1),(renderer.height-100)/(maxY-minY||1));
  const pr=(x,y,z)=>{const q=raw(x,y,z);return{x:renderer.width/2+(q.x-(minX+maxX)/2)*scale,y:renderer.height/2+(q.y-(minY+maxY)/2)*scale+12,d:q.d};};
  const faces=[],add=(cab,pts,fill,stroke)=>{const pp=pts.map(v=>pr(v.x,v.y,v.z));faces.push({cab,pts:pp,fill,stroke,depth:pp.reduce((s,q)=>s+q.d,0)/pp.length});};
  for(const cab of p.kitchen?.objects||[]){const g=geometry(p,cab);if(!g)continue;const z0=cab.bottom||0,z1=z0+cab.height,[a,b,c,d]=g.pts,sel=cab.id===state.selectedId;const front=sel?'#718563':'#9c8f7b',side=sel?'#647758':'#a99b87',top=sel?'#d8dfd2':'#d8d0c2',stroke=sel?'#314a2d':'#776d60';add(cab,[{...a,z:z0},{...b,z:z0},{...b,z:z1},{...a,z:z1}],'#b8ab98',stroke);add(cab,[{...d,z:z0},{...c,z:z0},{...c,z:z1},{...d,z:z1}],front,stroke);add(cab,[{...a,z:z1},{...b,z:z1},{...c,z:z1},{...d,z:z1}],top,stroke);add(cab,[{...b,z:z0},{...c,z:z0},{...c,z:z1},{...b,z:z1}],side,stroke);add(cab,[{...d,z:z0},{...a,z:z0},{...a,z:z1},{...d,z:z1}],side,stroke);}
  faces.sort((a,b)=>b.depth-a.depth);const c=renderer.ctx;
  for(const f of faces){c.beginPath();c.moveTo(f.pts[0].x,f.pts[0].y);f.pts.slice(1).forEach(q=>c.lineTo(q.x,q.y));c.closePath();c.fillStyle=f.fill;c.fill();c.strokeStyle=f.stroke;c.lineWidth=f.cab.id===state.selectedId?1.5:.7;c.stroke();state.hit3d.push({cabId:f.cab.id,pts:f.pts,depth:f.depth});}
}
function hitCabinet3D(screen){
  const hits=state.hit3d.filter(h=>pointInPolygon(screen,h.pts)).sort((a,b)=>a.depth-b.depth);return hits[0]?.cabId||null;
}
function installRendererPatch(){
  if(StudioRenderer.prototype.__kitchenPatched)return;StudioRenderer.prototype.__kitchenPatched=true;const oldDraw=StudioRenderer.prototype.draw;
  StudioRenderer.prototype.draw=function(project){const stored=readProject();if(stored?.kitchen)project.kitchen=stored.kitchen;state.renderer=this;oldDraw.call(this,project);if(this.view==='plan')drawKitchenPlan(this,project);else drawKitchen3D(this,project);};
}

function setMessage(text){const el=$('#statusMessage');if(el)el.textContent=text;}
function placementBadge(){let b=$('#cabinetPlacementBadge');if(!b){b=document.createElement('div');b.id='cabinetPlacementBadge';b.style.cssText='position:absolute;left:14px;top:58px;z-index:8;background:rgba(41,52,39,.92);color:#fff;border-radius:9px;padding:8px 10px;font:10px Inter,sans-serif;display:none';$('.stage')?.appendChild(b);}return b;}
function showPlacement(){const b=placementBadge();if(state.placing){const p=readProject(),w=wallById(p,state.targetWallId),name=PRESETS[state.placing]?.name||'cabinet';b.textContent=w?`Place ${name} on selected wall · click position · Esc to cancel`:`${name}: select a wall first`;b.style.display='block';}else b.style.display='none';}

function renderCabinetProperties(cab){
  const p=readProject(),panel=$('#propertiesPanel');if(!p||!panel)return;const stats=runStats(p,cab),internal=Math.max(0,cab.width-2*cab.carcassThickness),frontSingle=Math.max(0,cab.width-2*cab.frontGap),frontEach=cab.frontCount>1?Math.max(0,(cab.width-(cab.frontCount+1)*cab.frontGap)/cab.frontCount):frontSingle;
  $('#propertyContext').textContent='Cabinet';
  panel.innerHTML=`<div class="prop-card"><h4>${cab.name}</h4>
    <div class="prop-row"><span>Width</span><input class="prop-input" id="cabWidth" value="${cab.width}"></div>
    <div class="prop-row"><span>Depth</span><input class="prop-input" id="cabDepth" value="${cab.depth}"></div>
    <div class="prop-row"><span>Height</span><input class="prop-input" id="cabHeight" value="${cab.height}"></div>
    <div class="prop-row"><span>Bottom</span><input class="prop-input" id="cabBottom" value="${cab.bottom}"></div>
    <div class="prop-row"><span>Wall offset</span><input class="prop-input" id="cabOffset" value="${Math.round(cab.offset)}"></div>
    <div class="prop-row"><span>Front</span><select class="prop-input" id="cabFront"><option value="door1" ${cab.frontType==='door1'?'selected':''}>1 door</option><option value="door2" ${cab.frontType==='door2'?'selected':''}>2 doors</option><option value="drawers" ${cab.frontType==='drawers'?'selected':''}>Drawers</option><option value="horizontal" ${cab.frontType==='horizontal'?'selected':''}>Horizontal</option><option value="mixed" ${cab.frontType==='mixed'?'selected':''}>Mixed</option></select></div>
    <div class="prop-row"><span>Carcass</span><input class="prop-input" id="cabCarcass" value="${cab.carcassThickness}"></div>
    <div class="prop-row"><span>Back</span><input class="prop-input" id="cabBack" value="${cab.backThickness}"></div>
    <div class="prop-row"><span>Front thick.</span><input class="prop-input" id="cabFrontThick" value="${cab.frontThickness}"></div>
    <div class="prop-row"><span>Front gap</span><input class="prop-input" id="cabGap" value="${cab.frontGap}"></div>
    <button class="btn ghost full" id="cabDuplicate" style="margin-top:10px">Duplicate next</button>
    <button class="btn ghost full" id="cabDelete" style="margin-top:8px;color:#8c4b3e">Delete cabinet</button></div>
    <div class="render-note"><b>Construction</b><br>External module: ${Math.round(cab.width)} mm<br>Internal clear: ${Math.round(internal)} mm<br>${cab.frontCount>1?`Approx. each front: ${frontEach.toFixed(1)} mm`:`Approx. front: ${frontSingle.toFixed(1)} mm`}<br><br><b>Run</b><br>Wall: ${Math.round(stats?.length||0)} mm<br>Nominal used: ${Math.round(stats?.used||0)} mm<br>Remaining: ${Math.round(stats?.remaining||0)} mm</div>`;

  const mutate=(fn)=>{const q=readProject(),o=cabById(q,cab.id);if(!o)return;pushKitchenHistory(q);fn(q,o);syncRuns(q);writeProject(q);state.selectedId=o.id;renderCabinetProperties(o);};
  const numeric=(id,key,min=0)=>$(id).onchange=e=>{const v=Number(e.target.value);if(!Number.isFinite(v)||v<min)return;mutate((q,o)=>{if(key==='width'){const w=wallById(q,o.wallId);const next=snapOffset(q,o.wallId,o.side,o.offset,v,wallLength(w),o.id);if(next==null){setMessage('No free space on this wall for that width.');return;}o.offset=next;}o[key]=v;});};
  numeric('#cabWidth','width',100);numeric('#cabDepth','depth',100);numeric('#cabHeight','height',100);numeric('#cabBottom','bottom',0);numeric('#cabCarcass','carcassThickness',8);numeric('#cabBack','backThickness',2);numeric('#cabFrontThick','frontThickness',8);numeric('#cabGap','frontGap',0);
  $('#cabOffset').onchange=e=>{const v=Number(e.target.value);if(!Number.isFinite(v))return;mutate((q,o)=>{const w=wallById(q,o.wallId),next=snapOffset(q,o.wallId,o.side,v,o.width,wallLength(w),o.id);if(next!=null)o.offset=next;});};
  $('#cabFront').onchange=e=>mutate((q,o)=>{o.frontType=e.target.value;o.frontCount=e.target.value==='door2'?2:e.target.value==='drawers'?3:1;});
  $('#cabDelete').onclick=()=>{const q=readProject();pushKitchenHistory(q);q.kitchen.objects=q.kitchen.objects.filter(o=>o.id!==cab.id);syncRuns(q);state.selectedId=null;writeProject(q);panel.innerHTML='';$('#propertyContext').textContent='Project';};
  $('#cabDuplicate').onclick=()=>{const q=readProject(),o=cabById(q,cab.id),w=o&&wallById(q,o.wallId);if(!o||!w)return;pushKitchenHistory(q);const next=snapOffset(q,o.wallId,o.side,o.offset+o.width,o.width,wallLength(w));if(next==null){state.kitchenHistory.pop();setMessage('No free space next to this cabinet.');return;}const copy={...o,id:uid(),offset:next,name:o.name};q.kitchen.objects.push(copy);syncRuns(q);state.selectedId=copy.id;writeProject(q);renderCabinetProperties(copy);};
}

function installInteractions(){
  document.addEventListener('click',e=>{
    const card=e.target.closest?.('.catalog-card[data-cat="cabinets"]');if(!card)return;
    e.preventDefault();e.stopImmediatePropagation();state.placing=card.dataset.id;state.selectedId=null;
    const p=readProject();if(!wallById(p,state.targetWallId)){showPlacement();setMessage(`${PRESETS[state.placing]?.name||'Cabinet'} selected. First click the wall where this run belongs.`);}else{showPlacement();setMessage(`${PRESETS[state.placing]?.name||'Cabinet'} selected. Click a position along the selected wall.`);}
    document.querySelector('.view-btn[data-view="plan"]')?.click();
  },true);

  const canvas=$('#workspaceCanvas');
  if(canvas)canvas.addEventListener('pointerdown',e=>{
    const active=$('.view-btn.active')?.dataset.view,r=canvas.getBoundingClientRect(),screen={x:e.clientX-r.left,y:e.clientY-r.top},p=readProject();if(!p||!state.renderer)return;

    if(active==='plan'){
      if(state.placing){
        e.preventDefault();e.stopImmediatePropagation();
        if(!wallById(p,state.targetWallId)){
          const wall=wallHitPlan(p,screen);if(!wall){setMessage('Select a wall first. Cabinets are wall-bound by default.');return;}state.targetWallId=wall.id;showPlacement();setMessage('Wall selected. Now click where the cabinet should start in this run.');triggerRedraw();return;
        }
        const world=state.renderer.screenToWorld(screen),placement=placementOnWall(p,state.targetWallId,world),maxPx=65;
        if(!placement||(placement.d*(state.renderer.camera?.zoom||.1))>maxPx){setMessage('Click along the selected wall/run. Cabinet placement is locked to that wall.');return;}
        pushKitchenHistory(p);const cab=createCabinet(p,state.placing,world,state.targetWallId);if(!cab){state.kitchenHistory.pop();setMessage('No free space is available on the selected wall for this cabinet.');return;}state.selectedId=cab.id;writeProject(p);renderCabinetProperties(cab);setMessage(`${cab.name} placed on selected wall.`);return;
      }

      const hit=planHit(p,screen);if(hit){e.preventDefault();e.stopImmediatePropagation();state.selectedId=hit.id;state.targetWallId=hit.wallId;renderCabinetProperties(hit);triggerRedraw();return;}
      const wall=wallHitPlan(p,screen);if(wall){state.targetWallId=wall.id;state.selectedId=null;setMessage('Wall selected for the next cabinet run.');showPlacement();}
      return;
    }

    if(active==='3d'||active==='render'){
      const id=hitCabinet3D(screen);if(id){e.preventDefault();e.stopImmediatePropagation();const cab=cabById(p,id);if(!cab)return;state.selectedId=id;state.targetWallId=cab.wallId;renderCabinetProperties(cab);triggerRedraw();setMessage('Cabinet selected in 3D. Edit dimensions in Properties to see live changes.');}
    }
  },true);

  const undo=$('#undoBtn');if(undo)undo.addEventListener('click',e=>{
    if(!state.kitchenHistory.length)return;
    e.preventDefault();e.stopImmediatePropagation();const p=readProject();if(!p)return;const prev=state.kitchenHistory.pop();try{p.kitchen=JSON.parse(prev);}catch{return;}state.selectedId=null;writeProject(p);$('#propertiesPanel').innerHTML='';$('#propertyContext').textContent='Project';setMessage('Cabinet change undone.');
  },true);

  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.placing){state.placing=null;showPlacement();setMessage('Cabinet placement cancelled.');}});
}

installRendererPatch();installInteractions();showPlacement();triggerRedraw();
