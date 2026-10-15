import {StudioRenderer} from './render.mjs';
import {roomPolygon,wallLength} from './model.mjs';

const STORAGE_KEY='kitchen-studio-project-v2';
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

const SPECS={
  oven:{name:'Built-in oven',short:'OV',hosts:['tall'],recommended:['tall-oven'],mount:'front',width:595,depth:550,height:595,bottom:900,colour:'#303532'},
  hob:{name:'Cooking hob',short:'HOB',hosts:['base'],mount:'top',width:590,depth:520,height:55,bottom:null,colour:'#232826'},
  fridge:{name:'Refrigerator',short:'FR',hosts:['tall'],mount:'front-full',width:600,depth:560,height:2000,bottom:0,colour:'#aeb2ad'},
  dishwasher:{name:'Dishwasher',short:'DW',hosts:['base'],mount:'front-full',width:600,depth:550,height:720,bottom:null,colour:'#b9bcb8'},
  hood:{name:'Extractor',short:'EXT',hosts:['upper','base'],mount:'elevated-front',width:600,depth:320,height:350,bottom:1500,colour:'#8f9691'},
  sink:{name:'Sink',short:'SK',hosts:['base'],mount:'top',width:500,depth:400,height:200,bottom:null,colour:'#88938e'}
};

let rendererRef=null;
let draft=null;
let placementArmed=false;
let selectedApplianceId=null;
let changingHostId=null;

function read(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch{return null;}}
function ensure(p){p.kitchen=p.kitchen||{objects:[],runs:[]};p.kitchen.objects=Array.isArray(p.kitchen.objects)?p.kitchen.objects:[];p.kitchen.appliances=Array.isArray(p.kitchen.appliances)?p.kitchen.appliances:[];return p;}
function write(p){ensure(p);p.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(p));window.dispatchEvent(new Event('resize'));}
function uid(){return 'app_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);}
function status(t){const el=$('#statusMessage');if(el)el.textContent=t;}
function activeView(){return $('.view-btn.active')?.dataset.view||'plan';}
function appliancesTabActive(){return !!$('.catalog-tab[data-cat="appliances"].active');}
function cabById(p,id){return p.kitchen?.objects?.find(o=>o.id===id)||null;}
function applianceById(p,id){return p.kitchen?.appliances?.find(o=>o.id===id)||null;}
function pointInPolygon(pt,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],hit=((a.y>pt.y)!==(b.y>pt.y))&&(pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y+1e-9)+a.x);if(hit)inside=!inside;}return inside;}

function cabinetGeometry(p,cab){
  const w=p.room?.walls?.find(x=>x.id===cab.wallId);if(!w)return null;
  const dx=w.end.x-w.start.x,dy=w.end.y-w.start.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L;
  let nx=-uy,ny=ux;if((cab.side||1)<0){nx=-nx;ny=-ny;}
  const wallHalf=(w.thickness||100)/2,backX=w.start.x+ux*cab.offset+nx*wallHalf,backY=w.start.y+uy*cab.offset+ny*wallHalf;
  const p0={x:backX,y:backY},p1={x:backX+ux*cab.width,y:backY+uy*cab.width},p2={x:p1.x+nx*cab.depth,y:p1.y+ny*cab.depth},p3={x:p0.x+nx*cab.depth,y:p0.y+ny*cab.depth};
  return{wall:w,ux,uy,nx,ny,L,pts:[p0,p1,p2,p3],frontA:p3,frontB:p2,center:{x:(p0.x+p2.x)/2,y:(p0.y+p2.y)/2}};
}

function planCabinetHit(p,screen){
  if(!rendererRef)return null;
  for(const cab of [...(p.kitchen?.objects||[])].reverse()){
    const g=cabinetGeometry(p,cab);if(!g)continue;
    const pts=g.pts.map(q=>rendererRef.worldToScreen(q));
    if(pointInPolygon(screen,pts))return cab;
  }
  return null;
}

function compatible(spec,cab){return !!spec&&!!cab&&spec.hosts.includes(cab.kind);}
function hostDescription(spec){
  if(spec.mount==='top')return 'Base cabinet / worktop host';
  if(spec.mount==='elevated-front')return 'Upper cabinet or base cabinet position';
  if(spec.hosts.includes('tall'))return 'Tall cabinet housing';
  return spec.hosts.join(' / ');
}
function recommendedText(type){
  if(type==='oven')return 'Recommended: Tall · oven housing.';
  if(type==='hob')return 'Insert into a base cabinet below the worktop.';
  if(type==='sink')return 'Insert into a base cabinet below the worktop.';
  if(type==='dishwasher')return 'Select a base cabinet. The appliance replaces the visible cabinet front.';
  if(type==='fridge')return 'Select a tall cabinet housing. Freestanding placement will be added later.';
  if(type==='hood')return 'Select an upper cabinet, or the base/hob position below a wall-mounted extractor.';
  return '';
}

function createDraft(type){const s=SPECS[type];if(!s)return null;return{type,name:s.name,width:s.width,depth:s.depth,height:s.height,bottom:s.bottom,manufacturer:'',model:'',colour:s.colour};}
function draftCardState(){
  $$('.catalog-card[data-cat="appliances"]').forEach(c=>c.classList.toggle('ks-appliance-active',!!draft&&c.dataset.id===draft.type));
}
function setArmed(v,changeId=null){placementArmed=!!v;changingHostId=changeId||null;status(v?(changeId?'Select the new host cabinet for this appliance.':'Select the cabinet that should host this appliance.'):'Appliance host selection cancelled.');}

function renderDraftProperties(){
  const panel=$('#propertiesPanel');if(!panel||!draft)return;const s=SPECS[draft.type];
  $('#propertyContext').textContent='New appliance';
  panel.innerHTML=`<div class="prop-card"><h4>${draft.name}</h4>
    <div class="prop-row"><span>Manufacturer</span><input class="prop-input" id="appDraftMaker" value="${draft.manufacturer}"></div>
    <div class="prop-row"><span>Model</span><input class="prop-input" id="appDraftModel" value="${draft.model}"></div>
    <div class="prop-row"><span>Width</span><input class="prop-input" id="appDraftW" value="${draft.width}"></div>
    <div class="prop-row"><span>Depth</span><input class="prop-input" id="appDraftD" value="${draft.depth}"></div>
    <div class="prop-row"><span>Height</span><input class="prop-input" id="appDraftH" value="${draft.height}"></div>
    ${draft.bottom!=null?`<div class="prop-row"><span>Bottom elevation</span><input class="prop-input" id="appDraftB" value="${draft.bottom}"></div>`:''}
    <div class="render-note" style="margin:10px 0"><b>Host:</b> ${hostDescription(s)}<br>${recommendedText(draft.type)}</div>
    <button class="btn primary full" id="appChooseHost">Insert into selected cabinet</button>
    <button class="btn ghost full" id="appDraftCancel" style="margin-top:8px">Cancel</button></div>`;
  const n=(id,key,min=0)=>{const el=$(id);if(el)el.oninput=e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=min)draft[key]=v;};};
  $('#appDraftMaker').oninput=e=>draft.manufacturer=e.target.value;
  $('#appDraftModel').oninput=e=>draft.model=e.target.value;
  n('#appDraftW','width',100);n('#appDraftD','depth',50);n('#appDraftH','height',30);n('#appDraftB','bottom',0);
  $('#appChooseHost').onclick=()=>{setArmed(true);status(`Select a compatible cabinet for ${draft.name}.`);};
  $('#appDraftCancel').onclick=()=>{draft=null;setArmed(false);draftCardState();panel.innerHTML='';$('#propertyContext').textContent='Project';};
}

function renderPlacedProperties(app){
  const p=read(),panel=$('#propertiesPanel');if(!p||!panel)return;ensure(p);const host=cabById(p,app.hostId);
  $('#propertyContext').textContent='Appliance';
  panel.innerHTML=`<div class="prop-card"><h4>${app.name}</h4>
    <div class="prop-row"><span>Manufacturer</span><input class="prop-input" id="appMaker" value="${app.manufacturer||''}"></div>
    <div class="prop-row"><span>Model</span><input class="prop-input" id="appModel" value="${app.model||''}"></div>
    <div class="prop-row"><span>Width</span><input class="prop-input" id="appW" value="${app.width}"></div>
    <div class="prop-row"><span>Depth</span><input class="prop-input" id="appD" value="${app.depth}"></div>
    <div class="prop-row"><span>Height</span><input class="prop-input" id="appH" value="${app.height}"></div>
    ${app.bottom!=null?`<div class="prop-row"><span>Bottom elevation</span><input class="prop-input" id="appB" value="${app.bottom}"></div>`:''}
    <div class="render-note" style="margin:10px 0"><b>Hosted by:</b> ${host?.name||'Missing cabinet'}<br>Appliance position follows this cabinet automatically.</div>
    <button class="btn ghost full" id="appChangeHost">Change host cabinet</button>
    <button class="btn ghost full" id="appDelete" style="margin-top:8px;color:#8c4b3e">Delete appliance</button></div>`;
  const mutate=fn=>{const q=read();ensure(q);const a=applianceById(q,app.id);if(!a)return;fn(a);write(q);selectedApplianceId=a.id;renderPlacedProperties(a);};
  $('#appMaker').onchange=e=>mutate(a=>a.manufacturer=e.target.value);
  $('#appModel').onchange=e=>mutate(a=>a.model=e.target.value);
  const n=(id,key,min=0)=>{const el=$(id);if(el)el.onchange=e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=min)mutate(a=>a[key]=v);};};
  n('#appW','width',100);n('#appD','depth',50);n('#appH','height',30);n('#appB','bottom',0);
  $('#appChangeHost').onclick=()=>{draft=null;setArmed(true,app.id);status(`Select a new compatible host for ${app.name}.`);};
  $('#appDelete').onclick=()=>{const q=read();ensure(q);q.kitchen.appliances=q.kitchen.appliances.filter(a=>a.id!==app.id);selectedApplianceId=null;write(q);panel.innerHTML='';$('#propertyContext').textContent='Project';status('Appliance deleted.');};
}

function insertIntoHost(cab){
  const p=read();ensure(p);
  if(changingHostId){
    const app=applianceById(p,changingHostId),spec=app&&SPECS[app.type];
    if(!app||!compatible(spec,cab)){status(`This cabinet is not compatible with ${app?.name||'the appliance'}.`);return false;}
    app.hostId=cab.id;app.wallId=cab.wallId;app.side=cab.side;write(p);selectedApplianceId=app.id;setArmed(false);renderPlacedProperties(app);status(`${app.name} moved to ${cab.name}.`);return true;
  }
  if(!draft)return false;const spec=SPECS[draft.type];
  if(!compatible(spec,cab)){status(`${cab.name} is not a compatible host for ${draft.name}. ${recommendedText(draft.type)}`);return false;}
  const app={...draft,id:uid(),hostId:cab.id,wallId:cab.wallId,side:cab.side,mount:spec.mount};
  if(app.bottom==null){
    if(app.mount==='top')app.bottom=(cab.bottom||0)+(cab.height||0)+20;
    else if(app.type==='dishwasher')app.bottom=cab.bottom||0;
  }
  p.kitchen.appliances.push(app);write(p);selectedApplianceId=app.id;setArmed(false);renderPlacedProperties(app);status(`${app.name} inserted into ${cab.name}.`);return true;
}

function appliancePlanPolygon(p,app){
  const cab=cabById(p,app.hostId),g=cab&&cabinetGeometry(p,cab);if(!cab||!g)return null;
  const ratio=clamp((app.width||cab.width)/cab.width,.25,1),span=cab.width*ratio,offset=(cab.width-span)/2;
  const back={x:g.pts[0].x+g.ux*offset,y:g.pts[0].y+g.uy*offset};
  const a={x:back.x,y:back.y},b={x:a.x+g.ux*span,y:a.y+g.uy*span};
  let depth=Math.min(cab.depth,app.depth||cab.depth);
  if(app.mount==='front'||app.mount==='front-full'||app.mount==='elevated-front')depth=Math.min(cab.depth,Math.max(120,cab.depth*.45));
  const d={x:a.x+g.nx*depth,y:a.y+g.ny*depth},c={x:b.x+g.nx*depth,y:b.y+g.ny*depth};
  return{pts:[a,b,c,d],center:{x:(a.x+c.x)/2,y:(a.y+c.y)/2},g,cab};
}

function drawPlan(renderer,p){
  ensure(p);const ctx=renderer.ctx;
  for(const app of p.kitchen.appliances){const q=appliancePlanPolygon(p,app);if(!q)continue;const pts=q.pts.map(v=>renderer.worldToScreen(v)),sel=app.id===selectedApplianceId,s=SPECS[app.type];ctx.save();ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(v=>ctx.lineTo(v.x,v.y));ctx.closePath();ctx.fillStyle=sel?'rgba(62,88,58,.82)':app.mount==='top'?'rgba(85,101,94,.70)':'rgba(60,66,63,.68)';ctx.fill();ctx.strokeStyle=sel?'#24451f':'#383e3a';ctx.lineWidth=sel?2.5:1.2;ctx.stroke();const m=renderer.worldToScreen(q.center);ctx.fillStyle='#fff';ctx.font='bold 9px Inter,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(s?.short||'APP',m.x,m.y);ctx.restore();}
}

function projection(renderer,p){
  const walls=p.room?.walls||[];if(!walls.length)return null;const bb={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
  for(const w of walls)for(const q of[w.start,w.end]){bb.minX=Math.min(bb.minX,q.x);bb.maxX=Math.max(bb.maxX,q.x);bb.minY=Math.min(bb.minY,q.y);bb.maxY=Math.max(bb.maxY,q.y);}
  const center={x:(bb.minX+bb.maxX)/2,y:(bb.minY+bb.maxY)/2},yaw=renderer.camera.yaw,pitch=renderer.camera.pitch,co=Math.cos(yaw),si=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),H=p.settings?.ceilingHeight||2600;
  const raw=(x,y,z)=>{const xx=x-center.x,zz=-(y-center.y),yy=z-H*.35,rx=xx*co-zz*si,rz=xx*si+zz*co;return{x:rx,y:-yy*cp-rz*sp,d:rz*cp-yy*sp};};
  const corners=[];for(const w of walls)for(const q of[w.start,w.end])corners.push(raw(q.x,q.y,0),raw(q.x,q.y,w.height||H));
  const minX=Math.min(...corners.map(q=>q.x)),maxX=Math.max(...corners.map(q=>q.x)),minY=Math.min(...corners.map(q=>q.y)),maxY=Math.max(...corners.map(q=>q.y)),scale=Math.min((renderer.width-140)/(maxX-minX||1),(renderer.height-100)/(maxY-minY||1));
  return(x,y,z)=>{const q=raw(x,y,z);return{x:renderer.width/2+(q.x-(minX+maxX)/2)*scale,y:renderer.height/2+(q.y-(minY+maxY)/2)*scale+12,d:q.d};};
}

function drawFace(ctx,pts,fill,stroke='#303733',line=1){ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(q=>ctx.lineTo(q.x,q.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}
function draw3D(renderer,p){
  ensure(p);const pr=projection(renderer,p);if(!pr)return;const ctx=renderer.ctx;
  for(const app of p.kitchen.appliances){const cab=cabById(p,app.hostId),g=cab&&cabinetGeometry(p,cab);if(!cab||!g)continue;const spec=SPECS[app.type],sel=app.id===selectedApplianceId;
    const span=Math.min(cab.width,app.width||cab.width),start=(cab.width-span)/2;
    const f0={x:g.frontA.x+g.ux*start,y:g.frontA.y+g.uy*start},f1={x:f0.x+g.ux*span,y:f0.y+g.uy*span};
    if(app.mount==='top'){
      const d=Math.min(cab.depth*.75,app.depth||cab.depth*.7),inset=(cab.depth-d)/2,a={x:g.pts[0].x+g.ux*start+g.nx*inset,y:g.pts[0].y+g.uy*start+g.ny*inset},b={x:a.x+g.ux*span,y:a.y+g.uy*span},c={x:b.x+g.nx*d,y:b.y+g.ny*d},dd={x:a.x+g.nx*d,y:a.y+g.ny*d},z=(cab.bottom||0)+(cab.height||0)+25;
      drawFace(ctx,[pr(a.x,a.y,z),pr(b.x,b.y,z),pr(c.x,c.y,z),pr(dd.x,dd.y,z)],sel?'#567052':spec.colour,'#313733',sel?2:1);
    }else{
      let z0=Number(app.bottom);if(!Number.isFinite(z0))z0=cab.bottom||0;let z1=z0+(app.height||500);if(app.mount==='front-full'){z0=cab.bottom||0;z1=Math.min((cab.bottom||0)+(cab.height||0),z0+(app.height||cab.height));}
      drawFace(ctx,[pr(f0.x,f0.y,z0),pr(f1.x,f1.y,z0),pr(f1.x,f1.y,z1),pr(f0.x,f0.y,z1)],sel?'#567052':spec.colour,'#272c29',sel?2:1);
      if(app.type==='oven'){
        const cy=(z0+z1)/2,bar0=pr(f0.x,f0.y,cy+120),bar1=pr(f1.x,f1.y,cy+120);ctx.beginPath();ctx.moveTo(bar0.x,bar0.y);ctx.lineTo(bar1.x,bar1.y);ctx.strokeStyle='#b8bdb9';ctx.lineWidth=2;ctx.stroke();
      }
    }
  }
}

function appliancePlanHit(p,screen){
  if(!rendererRef)return null;ensure(p);
  for(const app of [...p.kitchen.appliances].reverse()){const q=appliancePlanPolygon(p,app);if(!q)continue;const pts=q.pts.map(v=>rendererRef.worldToScreen(v));if(pointInPolygon(screen,pts))return app;}
  return null;
}

function selectPlaced(app){selectedApplianceId=app.id;draft=null;setArmed(false);draftCardState();renderPlacedProperties(app);window.dispatchEvent(new Event('resize'));status(`${app.name} selected.`);}

function installRenderer(){if(StudioRenderer.prototype.__applianceEngineWrapped)return;StudioRenderer.prototype.__applianceEngineWrapped=true;const old=StudioRenderer.prototype.draw;StudioRenderer.prototype.draw=function(project){rendererRef=this;old.call(this,project);const stored=read();if(stored){ensure(stored);if(this.view==='plan')drawPlan(this,stored);else draw3D(this,stored);}};}

function installCatalog(){
  document.addEventListener('click',e=>{
    const tab=e.target.closest?.('.catalog-tab[data-cat="appliances"]');if(tab){selectedApplianceId=null;setArmed(false);setTimeout(()=>status('Appliances: choose a product, configure it, then insert it into a compatible cabinet.'),0);return;}
    const card=e.target.closest?.('.catalog-card[data-cat="appliances"]');if(!card)return;
    e.preventDefault();e.stopImmediatePropagation();const type=card.dataset.id;if(!SPECS[type])return;draft=createDraft(type);selectedApplianceId=null;setArmed(false);draftCardState();renderDraftProperties();status(`${draft.name} selected. Configure it on the right, then choose its host cabinet.`);
  },true);
  document.addEventListener('dragstart',e=>{const card=e.target.closest?.('.catalog-card[data-cat="appliances"]');if(!card||!SPECS[card.dataset.id])return;draft=createDraft(card.dataset.id);selectedApplianceId=null;draftCardState();renderDraftProperties();setArmed(true);e.dataTransfer?.setData('text/plain',card.dataset.id);},true);
}

function installPlanInteraction(){
  document.addEventListener('pointerdown',e=>{
    const canvas=e.target.closest?.('#workspaceCanvas');if(!canvas||activeView()!=='plan'||!rendererRef)return;const r=canvas.getBoundingClientRect(),screen={x:e.clientX-r.left,y:e.clientY-r.top},p=read();if(!p)return;ensure(p);
    if(placementArmed){const cab=planCabinetHit(p,screen);if(!cab){status('Click a cabinet that should host this appliance.');return;}e.preventDefault();e.stopImmediatePropagation();insertIntoHost(cab);return;}
    const app=appliancePlanHit(p,screen);if(app){e.preventDefault();e.stopImmediatePropagation();selectPlaced(app);return;}
  },true);

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&placementArmed){setArmed(false);if(draft)renderDraftProperties();}
    if((e.key==='Delete'||e.key==='Backspace')&&selectedApplianceId&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)){
      const p=read();if(!p)return;ensure(p);const a=applianceById(p,selectedApplianceId);if(!a)return;e.preventDefault();p.kitchen.appliances=p.kitchen.appliances.filter(x=>x.id!==a.id);selectedApplianceId=null;write(p);$('#propertiesPanel').innerHTML='';$('#propertyContext').textContent='Project';status('Appliance deleted.');
    }
  },true);
}

const style=document.createElement('style');style.textContent='.catalog-card[data-cat="appliances"]{cursor:pointer;user-select:none}.catalog-card[data-cat="appliances"].ks-appliance-active{outline:2px solid #486345;outline-offset:-2px;background:#eef4eb}';document.head.appendChild(style);

installRenderer();installCatalog();installPlanInteraction();
