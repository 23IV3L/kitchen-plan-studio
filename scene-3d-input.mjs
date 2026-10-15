import {StudioRenderer} from './render.mjs';

const STORAGE_KEY='kitchen-studio-project-v2';
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const state={renderer:null,drag:null,selectedApplianceId:null};
window.__ksScene3D=state;

function read(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch{return null;}}
function write(p){p.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(p));window.dispatchEvent(new Event('resize'));}
function pointInPolygon(pt,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],hit=((a.y>pt.y)!==(b.y>pt.y))&&(pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y+1e-9)+a.x);if(hit)inside=!inside;}return inside;}
function wallById(p,id){return p?.room?.walls?.find(w=>w.id===id)||null;}
function cabById(p,id){return p?.kitchen?.objects?.find(o=>o.id===id)||null;}
function appById(p,id){return p?.kitchen?.appliances?.find(o=>o.id===id)||null;}
function wallLength(w){return Math.hypot(w.end.x-w.start.x,w.end.y-w.start.y);}

function geometry(p,cab){
  const w=wallById(p,cab.wallId);if(!w)return null;
  const dx=w.end.x-w.start.x,dy=w.end.y-w.start.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L;
  let nx=-uy,ny=ux;if((cab.side||1)<0){nx=-nx;ny=-ny;}
  const half=(w.thickness||100)/2,bx=w.start.x+ux*cab.offset+nx*half,by=w.start.y+uy*cab.offset+ny*half;
  const p0={x:bx,y:by},p1={x:bx+ux*cab.width,y:by+uy*cab.width},p2={x:p1.x+nx*cab.depth,y:p1.y+ny*cab.depth},p3={x:p0.x+nx*cab.depth,y:p0.y+ny*cab.depth};
  return{wall:w,ux,uy,nx,ny,pts:[p0,p1,p2,p3],frontA:p3,frontB:p2};
}

function projector(renderer,p){
  const walls=p?.room?.walls||[];if(!walls.length)return null;
  const bb={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
  for(const w of walls)for(const q of[w.start,w.end]){bb.minX=Math.min(bb.minX,q.x);bb.maxX=Math.max(bb.maxX,q.x);bb.minY=Math.min(bb.minY,q.y);bb.maxY=Math.max(bb.maxY,q.y);}
  const center={x:(bb.minX+bb.maxX)/2,y:(bb.minY+bb.maxY)/2},yaw=renderer.camera.yaw,pitch=renderer.camera.pitch,co=Math.cos(yaw),si=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),H=p.settings?.ceilingHeight||2600;
  const raw=(x,y,z)=>{const xx=x-center.x,zz=-(y-center.y),yy=z-H*.35,rx=xx*co-zz*si,rz=xx*si+zz*co;return{x:rx,y:-yy*cp-rz*sp,d:rz*cp-yy*sp};};
  const corners=[];for(const w of walls)for(const q of[w.start,w.end])corners.push(raw(q.x,q.y,0),raw(q.x,q.y,w.height||H));
  const minX=Math.min(...corners.map(q=>q.x)),maxX=Math.max(...corners.map(q=>q.x)),minY=Math.min(...corners.map(q=>q.y)),maxY=Math.max(...corners.map(q=>q.y)),scale=Math.min((renderer.width-140)/(maxX-minX||1),(renderer.height-100)/(maxY-minY||1));
  return(x,y,z)=>{const q=raw(x,y,z);return{x:renderer.width/2+(q.x-(minX+maxX)/2)*scale,y:renderer.height/2+(q.y-(minY+maxY)/2)*scale+12,d:q.d};};
}

function cabinetFaces(renderer,p,cab){
  const g=geometry(p,cab),pr=projector(renderer,p);if(!g||!pr)return[];
  const z0=cab.bottom||0,z1=z0+(cab.height||0),[a,b,c,d]=g.pts;
  const polys=[
    [a,b,{...b,z:z1},{...a,z:z1}].map((q,i)=>pr(q.x,q.y,i<2?z0:z1)),
    [{...d,z:z0},{...c,z:z0},{...c,z:z1},{...d,z:z1}].map(q=>pr(q.x,q.y,q.z)),
    [{...a,z:z1},{...b,z:z1},{...c,z:z1},{...d,z:z1}].map(q=>pr(q.x,q.y,q.z)),
    [{...b,z:z0},{...c,z:z0},{...c,z:z1},{...b,z:z1}].map(q=>pr(q.x,q.y,q.z)),
    [{...d,z:z0},{...a,z:z0},{...a,z:z1},{...d,z:z1}].map(q=>pr(q.x,q.y,q.z))
  ];
  return polys.map(pts=>({pts,depth:pts.reduce((s,x)=>s+(x.d||0),0)/pts.length}));
}

function applianceFace(renderer,p,app){
  const cab=cabById(p,app.hostId),g=cab&&geometry(p,cab),pr=projector(renderer,p);if(!cab||!g||!pr)return null;
  const span=Math.min(cab.width,app.width||cab.width),start=(cab.width-span)/2;
  if(app.mount==='top'){
    const d=Math.min(cab.depth*.75,app.depth||cab.depth*.7),inset=(cab.depth-d)/2,a={x:g.pts[0].x+g.ux*start+g.nx*inset,y:g.pts[0].y+g.uy*start+g.ny*inset},b={x:a.x+g.ux*span,y:a.y+g.uy*span},c={x:b.x+g.nx*d,y:b.y+g.ny*d},dd={x:a.x+g.nx*d,y:a.y+g.ny*d},z=(cab.bottom||0)+(cab.height||0)+25;
    const pts=[pr(a.x,a.y,z),pr(b.x,b.y,z),pr(c.x,c.y,z),pr(dd.x,dd.y,z)];return{pts,depth:pts.reduce((s,x)=>s+(x.d||0),0)/pts.length};
  }
  const f0={x:g.frontA.x+g.ux*start,y:g.frontA.y+g.uy*start},f1={x:f0.x+g.ux*span,y:f0.y+g.uy*span};
  let z0=Number(app.bottom);if(!Number.isFinite(z0))z0=cab.bottom||0;let z1=z0+(app.height||500);if(app.mount==='front-full'){z0=cab.bottom||0;z1=Math.min((cab.bottom||0)+(cab.height||0),z0+(app.height||cab.height));}
  const pts=[pr(f0.x,f0.y,z0),pr(f1.x,f1.y,z0),pr(f1.x,f1.y,z1),pr(f0.x,f0.y,z1)];return{pts,depth:pts.reduce((s,x)=>s+(x.d||0),0)/pts.length};
}

function hitScene(screen){
  const p=read(),r=state.renderer;if(!p||!r)return null;
  const apps=[];for(const app of p.kitchen?.appliances||[]){const f=applianceFace(r,p,app);if(f&&pointInPolygon(screen,f.pts))apps.push({kind:'appliance',id:app.id,depth:f.depth});}
  if(apps.length)return apps.sort((a,b)=>a.depth-b.depth)[0];
  const cabs=[];for(const cab of p.kitchen?.objects||[]){for(const f of cabinetFaces(r,p,cab)){if(pointInPolygon(screen,f.pts))cabs.push({kind:'cabinet',id:cab.id,depth:f.depth});}}
  return cabs.sort((a,b)=>a.depth-b.depth)[0]||null;
}

function renderApplianceProperties(app){
  const p=read(),host=cabById(p,app.hostId),panel=$('#propertiesPanel');if(!panel)return;
  $('#propertyContext').textContent='Appliance';
  const movable=app.mount==='front'||app.mount==='elevated-front';
  panel.innerHTML=`<div class="prop-card"><h4>${app.name}</h4>
    <div class="prop-row"><span>Manufacturer</span><input class="prop-input" id="s3Maker" value="${app.manufacturer||''}"></div>
    <div class="prop-row"><span>Model</span><input class="prop-input" id="s3Model" value="${app.model||''}"></div>
    <div class="prop-row"><span>Width</span><input class="prop-input" id="s3W" value="${app.width}"></div>
    <div class="prop-row"><span>Depth</span><input class="prop-input" id="s3D" value="${app.depth}"></div>
    <div class="prop-row"><span>Height</span><input class="prop-input" id="s3H" value="${app.height}"></div>
    ${app.bottom!=null?`<div class="prop-row"><span>Bottom elevation</span><input class="prop-input" id="s3B" value="${app.bottom}"></div>`:''}
    <div class="render-note" style="margin:10px 0"><b>Hosted by:</b> ${host?.name||'Missing cabinet'}<br>${movable?'Drag vertically on the appliance in 3D to change its elevation.':'This appliance stays fixed to its host position.'}</div>
    <button class="btn ghost full" id="s3Delete" style="color:#8c4b3e">Delete appliance</button></div>`;
  const mutate=(key,val)=>{const q=read(),a=appById(q,app.id);if(!a)return;a[key]=val;write(q);state.selectedApplianceId=a.id;renderApplianceProperties(a);};
  $('#s3Maker').onchange=e=>mutate('manufacturer',e.target.value);$('#s3Model').onchange=e=>mutate('model',e.target.value);
  for(const [id,key,min] of [['#s3W','width',100],['#s3D','depth',50],['#s3H','height',30],['#s3B','bottom',0]]){const el=$(id);if(el)el.onchange=e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=min)mutate(key,v);};}
  $('#s3Delete').onclick=()=>{const q=read();q.kitchen.appliances=(q.kitchen.appliances||[]).filter(a=>a.id!==app.id);state.selectedApplianceId=null;write(q);panel.innerHTML='';$('#propertyContext').textContent='Project';};
}

function snapOffset(p,cab,desired){
  const w=wallById(p,cab.wallId);if(!w)return cab.offset;const L=wallLength(w),max=Math.max(0,L-cab.width),x=clamp(desired,0,max),vertical=(o)=>{const a0=cab.bottom||0,a1=a0+(cab.height||0),b0=o.bottom||0,b1=b0+(o.height||0);return a0<b1-.1&&a1>b0+.1;};
  const peers=(p.kitchen?.objects||[]).filter(o=>o.id!==cab.id&&o.wallId===cab.wallId&&(o.side||1)===(cab.side||1)&&vertical(o));
  const cands=[0,max];for(const o of peers)cands.push(o.offset-cab.width,o.offset+o.width);
  let best=x,bd=110;for(const raw of cands){const q=clamp(raw,0,max);if(Math.abs(q-x)<bd){const overlap=peers.some(o=>q<o.offset+o.width-.1&&q+cab.width>o.offset+.1);if(!overlap){best=q;bd=Math.abs(q-x);}}}
  if(peers.some(o=>best<o.offset+o.width-.1&&best+cab.width>o.offset+.1))return cab.offset;return best;
}

const oldDraw=StudioRenderer.prototype.draw;if(!StudioRenderer.prototype.__scene3dInputWrapped){StudioRenderer.prototype.__scene3dInputWrapped=true;StudioRenderer.prototype.draw=function(project){state.renderer=this;return oldDraw.call(this,project);};}

const canvas=$('#workspaceCanvas');
canvas?.addEventListener('pointerdown',e=>{
  if($('.view-btn.active')?.dataset.view!=='3d'||!state.renderer)return;
  const r=canvas.getBoundingClientRect(),screen={x:e.clientX-r.left,y:e.clientY-r.top},hit=hitScene(screen);if(!hit)return;
  e.preventDefault();e.stopImmediatePropagation();
  const p=read();
  if(hit.kind==='appliance'){
    const app=appById(p,hit.id);if(!app)return;state.selectedApplianceId=app.id;if(window.__ksCabinetSelection)window.__ksCabinetSelection.ids=[];renderApplianceProperties(app);window.dispatchEvent(new Event('resize'));
    if(app.mount==='front'||app.mount==='elevated-front'){state.drag={kind:'appliance',id:app.id,startY:e.clientY,startBottom:Number(app.bottom)||0,pointerId:e.pointerId};canvas.setPointerCapture?.(e.pointerId);canvas.style.cursor='ns-resize';}
    return;
  }
  const cab=cabById(p,hit.id);if(!cab)return;state.selectedApplianceId=null;window.dispatchEvent(new CustomEvent('ks:cabinet-placed',{detail:{id:cab.id}}));
  const pr=projector(state.renderer,p),w=wallById(p,cab.wallId),z=(cab.bottom||0)+(cab.height||0)/2;if(!pr||!w)return;const a=pr(w.start.x,w.start.y,z),b=pr(w.end.x,w.end.y,z),vx=b.x-a.x,vy=b.y-a.y,len2=vx*vx+vy*vy||1;
  state.drag={kind:'cabinet',id:cab.id,startX:e.clientX,startY:e.clientY,startOffset:cab.offset||0,vx,vy,len2,L:wallLength(w),pointerId:e.pointerId};canvas.setPointerCapture?.(e.pointerId);canvas.style.cursor='grabbing';
},true);

canvas?.addEventListener('pointermove',e=>{
  if(!state.drag)return;e.preventDefault();e.stopImmediatePropagation();const p=read();if(!p)return;
  if(state.drag.kind==='cabinet'){
    const cab=cabById(p,state.drag.id);if(!cab)return;const dx=e.clientX-state.drag.startX,dy=e.clientY-state.drag.startY,t=(dx*state.drag.vx+dy*state.drag.vy)/state.drag.len2,desired=state.drag.startOffset+t*state.drag.L,next=snapOffset(p,cab,desired);if(Math.abs(next-cab.offset)>.1){cab.offset=next;write(p);}return;
  }
  const app=appById(p,state.drag.id),host=app&&cabById(p,app.hostId);if(!app||!host)return;const dy=e.clientY-state.drag.startY,pxPerMm=Math.max(.08,Math.abs(state.drag.vy||0));const limit=Math.max(host.bottom||0,(host.bottom||0)+(host.height||0)-(app.height||0));app.bottom=clamp(state.drag.startBottom-dy/0.18,host.bottom||0,limit);write(p);renderApplianceProperties(app);
},true);

function endDrag(e){if(!state.drag)return;state.drag=null;if(canvas){canvas.style.cursor='default';try{if(e?.pointerId!=null)canvas.releasePointerCapture?.(e.pointerId);}catch{}}}
canvas?.addEventListener('pointerup',endDrag,true);canvas?.addEventListener('pointercancel',endDrag,true);
