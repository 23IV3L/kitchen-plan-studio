import {StudioRenderer} from './render.mjs';
import {wallLength} from './model.mjs';

const STORAGE_KEY='kitchen-studio-project-v2';
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

const PRESETS={
  'base-door':{name:'Base · 1 door',kind:'base',depth:560,height:720,bottom:100,frontType:'door1',frontCount:1},
  'base-double':{name:'Base · 2 doors',kind:'base',depth:560,height:720,bottom:100,frontType:'door2',frontCount:2},
  'base-drawers':{name:'Base · drawers',kind:'base',depth:560,height:720,bottom:100,frontType:'drawers',frontCount:3},
  'tall-pantry':{name:'Tall · pantry',kind:'tall',depth:600,height:2400,bottom:0,frontType:'door1',frontCount:1},
  'tall-oven':{name:'Tall · oven',kind:'tall',depth:600,height:2400,bottom:0,frontType:'mixed',frontCount:3},
  'upper-door':{name:'Upper · door',kind:'upper',depth:350,height:720,bottom:1500,frontType:'door1',frontCount:1},
  'upper-horizontal':{name:'Upper · horizontal',kind:'upper',depth:350,height:720,bottom:1500,frontType:'horizontal',frontCount:1},
  'corner':{name:'Corner',kind:'corner',depth:900,height:720,bottom:100,frontType:'corner',frontCount:1}
};

const state={ids:[],renderer:null,drag:null};
window.__ksCabinetSelection=state;

function read(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch{return null;}}
function write(p){p.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(p));window.dispatchEvent(new Event('resize'));}
function status(t){const el=$('#statusMessage');if(el)el.textContent=t;}
function pointInPolygon(pt,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],hit=((a.y>pt.y)!==(b.y>pt.y))&&(pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y+1e-9)+a.x);if(hit)inside=!inside;}return inside;}
function distToSegment(pt,a,b){const dx=b.x-a.x,dy=b.y-a.y,L2=dx*dx+dy*dy||1,t=clamp(((pt.x-a.x)*dx+(pt.y-a.y)*dy)/L2,0,1);return{d:Math.hypot(pt.x-(a.x+dx*t),pt.y-(a.y+dy*t)),t};}
function wallById(p,id){return p.room?.walls?.find(w=>w.id===id)||null;}
function cabById(p,id){return p.kitchen?.objects?.find(o=>o.id===id)||null;}
function family(o){if(o.kind==='upper')return'upper';if(o.kind==='tall')return'tall';if(o.kind==='corner')return'corner';return'base';}
function currentScope(){return window.__ksCabinetUI?.scopeType||null;}
function allowed(c){const scope=currentScope();return !scope||c.typeId===scope;}

function geometry(p,cab){
  const w=wallById(p,cab.wallId);if(!w)return null;
  const dx=w.end.x-w.start.x,dy=w.end.y-w.start.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L;
  let nx=-uy,ny=ux;if((cab.side||1)<0){nx=-nx;ny=-ny;}
  const half=(w.thickness||100)/2,bx=w.start.x+ux*cab.offset+nx*half,by=w.start.y+uy*cab.offset+ny*half;
  const p0={x:bx,y:by},p1={x:bx+ux*cab.width,y:by+uy*cab.width},p2={x:p1.x+nx*cab.depth,y:p1.y+ny*cab.depth},p3={x:p0.x+nx*cab.depth,y:p0.y+ny*cab.depth};
  return{wall:w,ux,uy,nx,ny,pts:[p0,p1,p2,p3],center:{x:(p0.x+p2.x)/2,y:(p0.y+p2.y)/2}};
}

function hitCabinet(p,screen){
  if(!state.renderer)return null;
  for(const cab of [...(p.kitchen?.objects||[])].reverse()){
    if(!allowed(cab))continue;const g=geometry(p,cab);if(!g)continue;
    const pts=g.pts.map(q=>state.renderer.worldToScreen(q));if(pointInPolygon(screen,pts))return cab;
  }
  return null;
}

function verticalOverlap(a,b){const a0=a.bottom||0,a1=a0+(a.height||0),b0=b.bottom||0,b1=b0+(b.height||0);return a0<b1-.1&&a1>b0+.1;}
function peers(p,cab){return(p.kitchen?.objects||[]).filter(o=>o.id!==cab.id&&o.wallId===cab.wallId&&(o.side||1)===(cab.side||1)&&verticalOverlap(o,cab));}
function intervals(p,cab){return peers(p,cab).map(o=>[o.offset,o.offset+o.width,o]).sort((a,b)=>a[0]-b[0]);}
function snapOffset(p,cab,desired,threshold=120){
  const w=wallById(p,cab.wallId);if(!w)return null;const L=wallLength(w),max=Math.max(0,L-cab.width),ints=intervals(p,cab),x=clamp(desired,0,max),cands=[0,max];for(const[a,b]of ints)cands.push(a-cab.width,b);
  let best=x,bd=threshold;for(const raw of cands){const q=clamp(raw,0,max);if(Math.abs(q-x)<bd&&!ints.some(([a,b])=>q<b-.1&&q+cab.width>a+.1)){best=q;bd=Math.abs(q-x);}}
  if(!ints.some(([a,b])=>best<b-.1&&best+cab.width>a+.1))return best;return null;
}
function reorderPacked(p,cab,target){
  const w=wallById(p,cab.wallId);if(!w)return false;const L=wallLength(w),others=peers(p,cab).sort((a,b)=>a.offset-b.offset),all=[...others,cab],total=all.reduce((s,o)=>s+o.width,0);if(total>L+.1)return false;
  const start0=Math.min(...all.map(o=>o.offset)),center=target+cab.width/2,order=[...others];let idx=order.findIndex(o=>center<o.offset+o.width/2);if(idx<0)idx=order.length;order.splice(idx,0,cab);let cur=clamp(start0,0,Math.max(0,L-total));for(const o of order){o.offset=cur;cur+=o.width;}return true;
}
function moveCabinet(p,cab,desired){const w=wallById(p,cab.wallId);if(!w)return false;const x=clamp(desired,0,Math.max(0,wallLength(w)-cab.width)),s=snapOffset(p,cab,x,120);if(s!=null){cab.offset=s;return true;}return reorderPacked(p,cab,x);}
function syncRuns(p){const map=new Map();for(const o of p.kitchen?.objects||[]){const key=`${o.wallId}:${o.side||1}`;if(!map.has(key))map.set(key,{id:key,wallId:o.wallId,side:o.side||1,objectIds:[]});map.get(key).objectIds.push(o.id);}for(const r of map.values())r.objectIds.sort((a,b)=>(cabById(p,a)?.offset||0)-(cabById(p,b)?.offset||0));p.kitchen.runs=[...map.values()];}

function common(arr,key){if(!arr.length)return null;const v=arr[0][key];return arr.every(o=>o[key]===v)?v:null;}
function typeOptions(cab){const fam=family(cab);return Object.entries(PRESETS).filter(([,p])=>family(p)===fam).map(([id,p])=>`<option value="${id}" ${cab.typeId===id?'selected':''}>${p.name}</option>`).join('');}
function frontCount(type,current=1){if(type==='door2')return 2;if(type==='drawers')return Math.max(2,current||3);return 1;}

function renderSelectionProperties(){
  const p=read(),panel=$('#propertiesPanel');if(!p||!panel)return;state.ids=state.ids.filter(id=>cabById(p,id));const arr=state.ids.map(id=>cabById(p,id)).filter(Boolean);
  if(!arr.length)return;
  if(arr.length===1){
    const o=arr[0];$('#propertyContext').textContent='Cabinet';
    panel.innerHTML=`<div class="prop-card"><h4>${o.name}</h4>
      <div class="prop-row"><span>Cabinet type</span><select class="prop-input" id="selCabType">${typeOptions(o)}</select></div>
      <div class="prop-row"><span>Width</span><input class="prop-input" id="selCabWidth" value="${o.width}"></div>
      <div class="prop-row"><span>Depth</span><input class="prop-input" id="selCabDepth" value="${o.depth}"></div>
      <div class="prop-row"><span>Height</span><input class="prop-input" id="selCabHeight" value="${o.height}"></div>
      <div class="prop-row"><span>Bottom</span><input class="prop-input" id="selCabBottom" value="${o.bottom||0}"></div>
      <div class="prop-row"><span>Wall position</span><input class="prop-input" id="selCabOffset" value="${Math.round(o.offset||0)}"></div>
      <div class="prop-row"><span>Front</span><select class="prop-input" id="selCabFront"><option value="door1" ${o.frontType==='door1'?'selected':''}>1 door</option><option value="door2" ${o.frontType==='door2'?'selected':''}>2 doors</option><option value="drawers" ${o.frontType==='drawers'?'selected':''}>Drawers</option><option value="horizontal" ${o.frontType==='horizontal'?'selected':''}>Horizontal</option><option value="mixed" ${o.frontType==='mixed'?'selected':''}>Mixed</option></select></div>
      <div class="prop-row"><span>Carcass</span><input class="prop-input" id="selCabCarcass" value="${o.carcassThickness||18}"></div>
      <div class="prop-row"><span>Back</span><input class="prop-input" id="selCabBack" value="${o.backThickness||8}"></div>
      <div class="prop-row"><span>Front thick.</span><input class="prop-input" id="selCabFrontThick" value="${o.frontThickness||18}"></div>
      <div class="prop-row"><span>Front gap</span><input class="prop-input" id="selCabGap" value="${o.frontGap||2}"></div>
      <button class="btn ghost full" id="selCabDelete" style="margin-top:10px;color:#8c4b3e">Delete cabinet</button></div>
      <div class="render-note">Drag this selected cabinet directly along its wall. It stays attached to the run and snaps/reorders against neighbouring cabinets.</div>`;
    const mutate=(fn)=>{const q=read(),x=cabById(q,o.id);if(!x)return;fn(q,x);syncRuns(q);write(q);renderSelectionProperties();};
    const num=(id,key,min=0)=>$(id).onchange=e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=min)mutate((q,x)=>{if(key==='offset')moveCabinet(q,x,v);else x[key]=v;});};
    num('#selCabWidth','width',100);num('#selCabDepth','depth',100);num('#selCabHeight','height',100);num('#selCabBottom','bottom',0);num('#selCabOffset','offset',0);num('#selCabCarcass','carcassThickness',8);num('#selCabBack','backThickness',2);num('#selCabFrontThick','frontThickness',8);num('#selCabGap','frontGap',0);
    $('#selCabType').onchange=e=>mutate((q,x)=>{const pr=PRESETS[e.target.value];if(!pr||family(pr)!==family(x))return;x.typeId=e.target.value;x.name=pr.name;x.kind=pr.kind;x.depth=pr.depth;x.height=pr.height;x.bottom=pr.bottom;x.frontType=pr.frontType;x.frontCount=pr.frontCount;});
    $('#selCabFront').onchange=e=>mutate((q,x)=>{x.frontType=e.target.value;x.frontCount=frontCount(e.target.value,x.frontCount);});
    $('#selCabDelete').onclick=()=>deleteSelected();
    return;
  }

  $('#propertyContext').textContent=`${arr.length} Cabinets`;
  const sameFamily=arr.every(o=>family(o)===family(arr[0])),sameType=common(arr,'typeId');
  const value=(key)=>{const v=common(arr,key);return v==null?'':v;};
  panel.innerHTML=`<div class="prop-card"><h4>${arr.length} cabinets selected</h4>
    ${sameFamily?`<div class="prop-row"><span>Cabinet type</span><select class="prop-input" id="multiCabType"><option value="">${sameType?'Choose type':'Mixed'}</option>${Object.entries(PRESETS).filter(([,pr])=>family(pr)===family(arr[0])).map(([id,pr])=>`<option value="${id}" ${sameType===id?'selected':''}>${pr.name}</option>`).join('')}</select></div>`:''}
    <div class="prop-row"><span>Width</span><input class="prop-input" id="multiCabWidth" value="${value('width')}" placeholder="Mixed"></div>
    <div class="prop-row"><span>Depth</span><input class="prop-input" id="multiCabDepth" value="${value('depth')}" placeholder="Mixed"></div>
    <div class="prop-row"><span>Height</span><input class="prop-input" id="multiCabHeight" value="${value('height')}" placeholder="Mixed"></div>
    <div class="prop-row"><span>Bottom</span><input class="prop-input" id="multiCabBottom" value="${value('bottom')}" placeholder="Mixed"></div>
    <div class="prop-row"><span>Carcass</span><input class="prop-input" id="multiCabCarcass" value="${value('carcassThickness')}" placeholder="Mixed"></div>
    <div class="prop-row"><span>Back</span><input class="prop-input" id="multiCabBack" value="${value('backThickness')}" placeholder="Mixed"></div>
    <div class="prop-row"><span>Front thick.</span><input class="prop-input" id="multiCabFrontThick" value="${value('frontThickness')}" placeholder="Mixed"></div>
    <div class="prop-row"><span>Front gap</span><input class="prop-input" id="multiCabGap" value="${value('frontGap')}" placeholder="Mixed"></div>
    <button class="btn ghost full" id="multiCabDelete" style="margin-top:10px;color:#8c4b3e">Delete selected cabinets</button></div>
    <div class="render-note">Edits are applied only to the selected cabinets. Shift-click adds/removes individual cabinets from this selection.</div>`;
  const apply=(key,min=0)=>{const el=$(`#${key.id}`);};
  const bind=(id,key,min=0)=>$(id).onchange=e=>{const v=Number(e.target.value);if(!Number.isFinite(v)||v<min)return;const q=read();for(const sid of state.ids){const x=cabById(q,sid);if(x)x[key]=v;}syncRuns(q);write(q);renderSelectionProperties();};
  bind('#multiCabWidth','width',100);bind('#multiCabDepth','depth',100);bind('#multiCabHeight','height',100);bind('#multiCabBottom','bottom',0);bind('#multiCabCarcass','carcassThickness',8);bind('#multiCabBack','backThickness',2);bind('#multiCabFrontThick','frontThickness',8);bind('#multiCabGap','frontGap',0);
  if(sameFamily)$('#multiCabType').onchange=e=>{if(!e.target.value)return;const pr=PRESETS[e.target.value],q=read();for(const sid of state.ids){const x=cabById(q,sid);if(!x||family(x)!==family(pr))continue;x.typeId=e.target.value;x.name=pr.name;x.kind=pr.kind;x.depth=pr.depth;x.height=pr.height;x.bottom=pr.bottom;x.frontType=pr.frontType;x.frontCount=pr.frontCount;}syncRuns(q);write(q);renderSelectionProperties();};
  $('#multiCabDelete').onclick=()=>deleteSelected();
}

function deleteSelected(){const p=read();if(!p||!state.ids.length)return;const set=new Set(state.ids);p.kitchen.objects=(p.kitchen?.objects||[]).filter(o=>!set.has(o.id));syncRuns(p);write(p);const n=state.ids.length;state.ids=[];$('#propertiesPanel').innerHTML='';$('#propertyContext').textContent='Project';status(`${n} cabinet${n===1?'':'s'} deleted.`);}
function clearSelection(){state.ids=[];window.dispatchEvent(new Event('resize'));const ui=window.__ksCabinetUI;if(ui?.scopeType!=null)window.dispatchEvent(new CustomEvent('ks:cabinet-scope',{detail:{typeId:ui.scopeType}}));else{$('#propertiesPanel').innerHTML='';$('#propertyContext').textContent='Project';}status('Cabinet selection cleared.');}
function selectAll(typeId=null){const p=read();if(!p)return;state.ids=(p.kitchen?.objects||[]).filter(o=>!typeId||o.typeId===typeId).map(o=>o.id);window.dispatchEvent(new Event('resize'));if(state.ids.length)renderSelectionProperties();status(`${state.ids.length} cabinet${state.ids.length===1?'':'s'} selected${typeId?' for this type':''}.`);}

function drawOverlay(renderer,p){if(renderer.view!=='plan'||!state.ids.length)return;const c=renderer.ctx;c.save();for(const id of state.ids){const cab=cabById(p,id),g=cab&&geometry(p,cab);if(!g)continue;const pts=g.pts.map(q=>renderer.worldToScreen(q));c.beginPath();c.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(q=>c.lineTo(q.x,q.y));c.closePath();c.strokeStyle='#214d20';c.lineWidth=3;c.stroke();const m=renderer.worldToScreen(g.center);c.beginPath();c.arc(m.x,m.y,5,0,Math.PI*2);c.fillStyle='#fff';c.fill();c.strokeStyle='#214d20';c.lineWidth=2;c.stroke();}c.restore();}

const oldDraw=StudioRenderer.prototype.draw;
if(!StudioRenderer.prototype.__cabinetSelectionWrapped){StudioRenderer.prototype.__cabinetSelectionWrapped=true;StudioRenderer.prototype.draw=function(project){state.renderer=this;const result=oldDraw.call(this,project);const stored=read();if(stored?.kitchen)project.kitchen=stored.kitchen;drawOverlay(this,project);return result;};}

window.addEventListener('ks:cabinet-select-all',e=>selectAll(e.detail?.typeId||null));
window.addEventListener('ks:cabinet-clear-selection',clearSelection);
window.addEventListener('ks:cabinet-scope',()=>{state.ids=[];window.dispatchEvent(new Event('resize'));});
window.addEventListener('ks:cabinet-placed',e=>{state.ids=e.detail?.id?[e.detail.id]:[];window.dispatchEvent(new Event('resize'));if(state.ids.length)renderSelectionProperties();});

document.addEventListener('pointerdown',e=>{
  const canvas=$('#workspaceCanvas');if(e.target!==canvas||!state.renderer)return;
  const view=$('.view-btn.active')?.dataset.view;if(view!=='plan')return;
  if(window.__ksCabinetUI?.placementArmed)return;
  const rect=canvas.getBoundingClientRect(),screen={x:e.clientX-rect.left,y:e.clientY-rect.top},p=read();if(!p)return;const cab=hitCabinet(p,screen);if(!cab)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(e.shiftKey){const i=state.ids.indexOf(cab.id);if(i>=0)state.ids.splice(i,1);else state.ids.push(cab.id);}else state.ids=[cab.id];
  window.dispatchEvent(new Event('resize'));if(state.ids.length)renderSelectionProperties();else clearSelection();
  if(!e.shiftKey&&state.ids.length===1){const g=geometry(p,cab),world=state.renderer.screenToWorld(screen),hit=distToSegment(world,g.wall.start,g.wall.end);state.drag={id:cab.id,grabAlong:hit.t*wallLength(g.wall)-cab.offset,snapshot:JSON.stringify(p.kitchen),moved:false,pointerId:e.pointerId};canvas.setPointerCapture?.(e.pointerId);canvas.style.cursor='grabbing';}
},true);

document.addEventListener('pointermove',e=>{if(!state.drag||!state.renderer)return;const canvas=$('#workspaceCanvas'),rect=canvas.getBoundingClientRect(),screen={x:e.clientX-rect.left,y:e.clientY-rect.top},world=state.renderer.screenToWorld(screen),p=read(),cab=cabById(p,state.drag.id);if(!cab)return;const w=wallById(p,cab.wallId);if(!w)return;const hit=distToSegment(world,w.start,w.end),desired=hit.t*wallLength(w)-state.drag.grabAlong,old=cab.offset;if(moveCabinet(p,cab,desired)&&Math.abs(cab.offset-old)>.1){state.drag.moved=true;syncRuns(p);write(p);e.preventDefault();e.stopImmediatePropagation();}},true);
function finishDrag(){if(!state.drag)return;const moved=state.drag.moved;state.drag=null;const canvas=$('#workspaceCanvas');if(canvas)canvas.style.cursor='default';if(moved){renderSelectionProperties();status('Cabinet moved along its wall/run.');}}
document.addEventListener('pointerup',finishDrag,true);document.addEventListener('pointercancel',finishDrag,true);

window.addEventListener('keydown',e=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
  if((e.key==='Delete'||e.key==='Backspace')&&state.ids.length){e.preventDefault();deleteSelected();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&$('.catalog-tab[data-cat="cabinets"].active')){e.preventDefault();selectAll(currentScope());}
});
