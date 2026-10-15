import {roomPolygon,wallLength} from './model.mjs';
import {StudioRenderer} from './render.mjs';

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

let rendererRef=null;
let draft=null;
let placementArmed=false;
let lastWallId=null;

function read(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch{return null;}}
function write(p){p.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(p));window.dispatchEvent(new Event('resize'));}
function uid(){return 'cab_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);}
function status(t){const el=$('#statusMessage');if(el)el.textContent=t;}
function pointInPolygon(pt,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],hit=((a.y>pt.y)!==(b.y>pt.y))&&(pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y+1e-9)+a.x);if(hit)inside=!inside;}return inside;}
function distToSegment(pt,a,b){const dx=b.x-a.x,dy=b.y-a.y,L2=dx*dx+dy*dy||1,t=clamp(((pt.x-a.x)*dx+(pt.y-a.y)*dy)/L2,0,1),x=a.x+dx*t,y=a.y+dy*t;return{d:Math.hypot(pt.x-x,pt.y-y),t,x,y};}
function verticalOverlap(a,b){const a0=a.bottom||0,a1=a0+(a.height||0),b0=b.bottom||0,b1=b0+(b.height||0);return a0<b1-.1&&a1>b0+.1;}
function interiorSide(p,w,along){const poly=roomPolygon(p);if(!poly)return 1;const dx=w.end.x-w.start.x,dy=w.end.y-w.start.y,L=Math.hypot(dx,dy)||1,px=w.start.x+dx*(along/L),py=w.start.y+dy*(along/L),nx=-dy/L,ny=dx/L,s=180;if(pointInPolygon({x:px+nx*s,y:py+ny*s},poly))return 1;if(pointInPolygon({x:px-nx*s,y:py-ny*s},poly))return -1;return 1;}
function nearestWall(p,pt){let best=null;for(const w of p.room?.walls||[]){const h=distToSegment(pt,w.start,w.end);if(!best||h.d<best.d)best={wall:w,d:h.d,along:h.t*wallLength(w)};}return best;}
function intervals(p,cab){return(p.kitchen?.objects||[]).filter(o=>o.wallId===cab.wallId&&(o.side||1)===(cab.side||1)&&verticalOverlap(o,cab)).map(o=>[o.offset,o.offset+o.width]).sort((a,b)=>a[0]-b[0]);}
function snapOffset(p,cab,desired){const w=(p.room?.walls||[]).find(x=>x.id===cab.wallId);if(!w)return null;const L=wallLength(w),max=Math.max(0,L-cab.width),ints=intervals(p,cab),x0=clamp(desired,0,max),candidates=[0,max];for(const[a,b]of ints)candidates.push(a-cab.width,b);let best=null,bd=Infinity;for(const raw of candidates){const x=clamp(raw,0,max);if(ints.some(([a,b])=>x<b-.1&&x+cab.width>a+.1))continue;const d=Math.abs(x-x0);if(d<bd){best=x;bd=d;}}if(best!=null&&bd<=140)return best;if(!ints.some(([a,b])=>x0<b-.1&&x0+cab.width>a+.1))return x0;let cursor=0,gaps=[];for(const[a,b]of ints){if(a-cursor>=cab.width)gaps.push(cursor);cursor=Math.max(cursor,b);}if(L-cursor>=cab.width)gaps.push(cursor);if(!gaps.length)return null;return gaps.reduce((q,g)=>Math.abs(g-x0)<Math.abs(q-x0)?g:q,gaps[0]);}
function syncRuns(p){const map=new Map();for(const o of p.kitchen?.objects||[]){const key=`${o.wallId}:${o.side||1}`;if(!map.has(key))map.set(key,{id:key,wallId:o.wallId,side:o.side||1,objectIds:[]});map.get(key).objectIds.push(o.id);}for(const run of map.values())run.objectIds.sort((a,b)=>((p.kitchen.objects.find(o=>o.id===a)?.offset)||0)-((p.kitchen.objects.find(o=>o.id===b)?.offset)||0));p.kitchen.runs=[...map.values()];}

function newDraft(id){const p=PRESETS[id];if(!p)return null;return{typeId:id,name:p.name,kind:p.kind,width:p.width,depth:p.depth,height:p.height,bottom:p.bottom,frontType:p.frontType,frontCount:p.frontCount,carcassThickness:18,backThickness:8,frontThickness:18,frontGap:2,materialId:'mdf',locked:false};}

function badge(){let b=$('#cabinetPlacementFixBadge');if(!b){b=document.createElement('div');b.id='cabinetPlacementFixBadge';b.style.cssText='position:absolute;left:14px;top:58px;z-index:12;background:rgba(41,52,39,.94);color:#fff;border-radius:9px;padding:8px 10px;font:10px Inter,sans-serif;display:none;pointer-events:none';$('.stage')?.appendChild(b);}return b;}
function updateCardState(){document.querySelectorAll('.catalog-card[data-cat="cabinets"]').forEach(c=>c.classList.toggle('ks-preset-active',!!draft&&c.dataset.id===draft.typeId));}
function setArmed(v){placementArmed=!!v;const b=badge();if(placementArmed&&draft){b.textContent=`${draft.name} ready · click once on the required wall`;b.style.display='block';status('Placement armed. Click once on the required wall/run.');}else b.style.display='none';}

function frontCountFor(type,current=1){if(type==='door2')return 2;if(type==='drawers')return Math.max(2,current||3);return 1;}
function renderDraftProperties(){
  const panel=$('#propertiesPanel');if(!panel||!draft)return;
  $('#propertyContext').textContent='New cabinet';
  panel.innerHTML=`<div class="prop-card"><h4>${draft.name}</h4>
    <div class="prop-row"><span>Width</span><input class="prop-input" id="draftCabWidth" value="${draft.width}"></div>
    <div class="prop-row"><span>Depth</span><input class="prop-input" id="draftCabDepth" value="${draft.depth}"></div>
    <div class="prop-row"><span>Height</span><input class="prop-input" id="draftCabHeight" value="${draft.height}"></div>
    <div class="prop-row"><span>Bottom</span><input class="prop-input" id="draftCabBottom" value="${draft.bottom}"></div>
    <div class="prop-row"><span>Front</span><select class="prop-input" id="draftCabFront"><option value="door1" ${draft.frontType==='door1'?'selected':''}>1 door</option><option value="door2" ${draft.frontType==='door2'?'selected':''}>2 doors</option><option value="drawers" ${draft.frontType==='drawers'?'selected':''}>Drawers</option><option value="horizontal" ${draft.frontType==='horizontal'?'selected':''}>Horizontal</option><option value="mixed" ${draft.frontType==='mixed'?'selected':''}>Mixed</option></select></div>
    <div class="prop-row"><span>Carcass</span><input class="prop-input" id="draftCabCarcass" value="${draft.carcassThickness}"></div>
    <div class="prop-row"><span>Back</span><input class="prop-input" id="draftCabBack" value="${draft.backThickness}"></div>
    <div class="prop-row"><span>Front thick.</span><input class="prop-input" id="draftCabFrontThick" value="${draft.frontThickness}"></div>
    <div class="prop-row"><span>Front gap</span><input class="prop-input" id="draftCabGap" value="${draft.frontGap}"></div>
    <button class="btn primary full" id="draftCabPlace" style="margin-top:10px">Place on wall</button>
    <button class="btn ghost full" id="draftCabCancel" style="margin-top:8px">Cancel</button></div>
    <div class="render-note"><b>Configure first.</b><br>Nothing is added yet. Edit the cabinet here, then either click <b>Place on wall</b> and click one wall position, or drag this cabinet card directly onto the 2D plan.</div>`;
  const bindNum=(id,key,min=0)=>{$(id).oninput=e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=min)draft[key]=v;};};
  bindNum('#draftCabWidth','width',100);bindNum('#draftCabDepth','depth',100);bindNum('#draftCabHeight','height',100);bindNum('#draftCabBottom','bottom',0);bindNum('#draftCabCarcass','carcassThickness',8);bindNum('#draftCabBack','backThickness',2);bindNum('#draftCabFrontThick','frontThickness',8);bindNum('#draftCabGap','frontGap',0);
  $('#draftCabFront').onchange=e=>{draft.frontType=e.target.value;draft.frontCount=frontCountFor(e.target.value,draft.frontCount);};
  $('#draftCabPlace').onclick=()=>setArmed(true);
  $('#draftCabCancel').onclick=()=>{draft=null;setArmed(false);updateCardState();panel.innerHTML='';$('#propertyContext').textContent='Project';status('New cabinet cancelled.');};
}

function choosePreset(id){draft=newDraft(id);setArmed(false);updateCardState();renderDraftProperties();status(`${draft.name} selected. Edit its properties, then place it once or drag it onto the plan.`);}

function placeAtScreen(screen){
  const p=read();if(!p||!draft||!rendererRef)return false;
  if(!p.room?.walls?.length){status('Create or draw the room walls first.');return false;}
  const world=rendererRef.screenToWorld(screen),near=nearestWall(p,world);
  let wall=near?.wall;
  if((!wall||near.d>900)&&lastWallId)wall=p.room.walls.find(w=>w.id===lastWallId)||wall;
  if(!wall){status('Choose a wall/run first.');return false;}
  const hit=distToSegment(world,wall.start,wall.end),L=wallLength(wall),side=interiorSide(p,wall,hit.t*L);
  const cab={...draft,id:uid(),wallId:wall.id,side,runId:`${wall.id}:${side}`,offset:0};
  p.kitchen=p.kitchen||{objects:[],runs:[]};p.kitchen.objects=p.kitchen.objects||[];
  const x=snapOffset(p,cab,hit.t*L-cab.width/2);if(x==null){status('No free space for this cabinet on the selected wall.');return false;}
  cab.offset=x;p.kitchen.objects.push(cab);syncRuns(p);lastWallId=wall.id;write(p);setArmed(false);status(`${cab.name} placed once. Select it in the plan to move or edit it.`);return true;
}

const oldDraw=StudioRenderer.prototype.draw;
if(!StudioRenderer.prototype.__placementFixWrapped){StudioRenderer.prototype.__placementFixWrapped=true;StudioRenderer.prototype.draw=function(project){rendererRef=this;return oldDraw.call(this,project);};}

function makeCardsDraggable(){document.querySelectorAll('.catalog-card[data-cat="cabinets"]').forEach(card=>{card.draggable=true;card.style.cursor='grab';});}
new MutationObserver(makeCardsDraggable).observe(document.documentElement,{childList:true,subtree:true});
makeCardsDraggable();

document.addEventListener('click',e=>{
  const card=e.target.closest?.('.catalog-card[data-cat="cabinets"]');if(!card)return;
  e.preventDefault();e.stopImmediatePropagation();choosePreset(card.dataset.id);
},true);

document.addEventListener('dragstart',e=>{
  const card=e.target.closest?.('.catalog-card[data-cat="cabinets"]');if(!card)return;
  if(!draft||draft.typeId!==card.dataset.id)choosePreset(card.dataset.id);
  e.dataTransfer?.setData('text/plain',card.dataset.id);if(e.dataTransfer)e.dataTransfer.effectAllowed='copy';
},true);

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(placementArmed||draft)){setArmed(false);status('Placement cancelled. Cabinet settings remain available on the right.');}},true);

const canvas=$('#workspaceCanvas');
if(canvas){
  canvas.addEventListener('dragover',e=>{if(!draft)return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';},true);
  canvas.addEventListener('drop',e=>{if(!draft)return;e.preventDefault();e.stopImmediatePropagation();const r=canvas.getBoundingClientRect(),screen={x:e.clientX-r.left,y:e.clientY-r.top};placeAtScreen(screen);},true);
  canvas.addEventListener('pointerdown',e=>{
    if(!rendererRef)return;const r=canvas.getBoundingClientRect(),screen={x:e.clientX-r.left,y:e.clientY-r.top},p=read();if(!p)return;
    if(placementArmed){e.preventDefault();e.stopImmediatePropagation();placeAtScreen(screen);return;}
    const world=rendererRef.screenToWorld(screen),near=nearestWall(p,world);if(near&&near.d*(rendererRef.camera?.zoom||.1)<=18)lastWallId=near.wall.id;
  },true);
}

const style=document.createElement('style');style.textContent='.catalog-card[data-cat="cabinets"]{cursor:grab;user-select:none}.catalog-card[data-cat="cabinets"].ks-preset-active{outline:2px solid #486345;outline-offset:-2px;background:#eef4eb}';document.head.appendChild(style);
