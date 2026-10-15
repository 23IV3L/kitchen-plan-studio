const STORAGE_KEY='kitchen-studio-project-v2';
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

const state={category:'walls'};
window.__ksMultiSelection={category:null,ids:[]};

function readProject(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch{return null;}}
function writeProject(p){p.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(p));}
function uid(prefix){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;}
function status(text){const el=$('#statusMessage');if(el)el.textContent=text;}
function refresh(){window.dispatchEvent(new Event('resize'));}

function roomAreaFromWalls(p){
  const walls=p?.room?.walls||[];if(walls.length<3)return 0;
  const pts=[];const used=new Set();let w=walls[0],joint=w.endJointId,first=w.startJointId;
  pts.push({...w.start},{...w.end});used.add(w.id);
  let guard=0;
  while(joint!==first&&guard++<walls.length+2){
    const next=walls.find(x=>!used.has(x.id)&&(x.startJointId===joint||x.endJointId===joint));if(!next)return 0;used.add(next.id);
    const useEnd=next.startJointId===joint;const pt=useEnd?next.end:next.start;joint=useEnd?next.endJointId:next.startJointId;pts.push({...pt});
  }
  if(joint!==first||pts.length<4)return 0;pts.pop();let sum=0;for(let i=0,j=pts.length-1;i<pts.length;j=i++)sum+=pts[j].x*pts[i].y-pts[i].x*pts[j].y;return Math.abs(sum)/2;
}

function buildRectangle(width,length,{source='manual'}={}){
  const p=readProject();if(!p)return false;
  width=Math.round(Number(width));length=Math.round(Number(length));if(width<300||length<300)return false;
  const thickness=Number(p.settings?.defaultWallThickness)||100,height=Number(p.settings?.ceilingHeight)||2600;
  const cx=Number(p.floorPlan?.x)||0,cy=Number(p.floorPlan?.y)||0,x0=cx-width/2,x1=cx+width/2,y0=cy-length/2,y1=cy+length/2;
  const j1=uid('joint'),j2=uid('joint'),j3=uid('joint'),j4=uid('joint');
  const wall=(start,end,sj,ej)=>({id:uid('wall'),type:'line',start,end,startJointId:sj,endJointId:ej,connectionMode:'connected',locked:false,thickness,height});
  p.room.walls=[
    wall({x:x0,y:y0},{x:x1,y:y0},j1,j2),
    wall({x:x1,y:y0},{x:x1,y:y1},j2,j3),
    wall({x:x1,y:y1},{x:x0,y:y1},j3,j4),
    wall({x:x0,y:y1},{x:x0,y:y0},j4,j1)
  ];
  p.kitchen=p.kitchen||{objects:[],runs:[]};p.kitchen.objects=[];p.kitchen.runs=[];
  p.room.surfaces=p.room.surfaces||{};
  if(p.room.surfaces.floor)p.room.surfaces.floor.enabled=true;
  p.roomTemplate={type:'rectangle',width,length,source};
  writeProject(p);return true;
}

function installRectangleTool(){
  const wallTool=$('#wallTool');if(!wallTool||$('#rectangleRoomTool'))return;
  const b=document.createElement('button');b.className='tool-card';b.id='rectangleRoomTool';b.innerHTML='<span class="tool-icon">□</span><span><b>Square / rectangle room</b><small>Enter dimensions + see room area</small></span>';
  wallTool.insertAdjacentElement('afterend',b);
  b.onclick=()=>showRectangleProperties();
}

function showRectangleProperties(){
  const panel=$('#propertiesPanel');if(!panel)return;const p=readProject(),tpl=p?.roomTemplate||{};
  const area=roomAreaFromWalls(p),bounds=dimensionGuessFromWalls(p);
  const width=Math.round(tpl.width||bounds.width||3000),length=Math.round(tpl.length||bounds.length||3000);
  $('#propertyContext').textContent='Room';
  panel.innerHTML=`<div class="prop-card"><h4>Square / rectangle room</h4>
    <div class="prop-row"><span>Width</span><input class="prop-input" id="roomRectWidth" value="${width}"></div>
    <div class="prop-row"><span>Length</span><input class="prop-input" id="roomRectLength" value="${length}"></div>
    <div class="prop-row"><span>Area</span><b id="roomRectArea">${((width*length)/1e6).toFixed(2)} m²</b></div>
    <button class="btn primary full" id="applyRectRoom" style="margin-top:10px">Create / replace room</button></div>
    <div class="render-note">Creates four connected editable walls. After creation every wall can still be moved, resized, disconnected or reshaped independently.</div>`;
  const calc=()=>{const w=Number($('#roomRectWidth').value)||0,l=Number($('#roomRectLength').value)||0;$('#roomRectArea').textContent=`${((w*l)/1e6).toFixed(2)} m²`;};
  $('#roomRectWidth').oninput=calc;$('#roomRectLength').oninput=calc;
  $('#applyRectRoom').onclick=()=>{const w=Number($('#roomRectWidth').value),l=Number($('#roomRectLength').value);if(!(w>=300&&l>=300)){status('Enter valid room dimensions in mm.');return;}const p=readProject();if((p?.room?.walls?.length||0)>0&&!confirm('Replace the current room walls? Existing cabinets will be cleared because their wall references would change.'))return;if(buildRectangle(w,l)){status(`Room created: ${w} × ${l} mm · ${((w*l)/1e6).toFixed(2)} m²`);location.reload();}};
}

function dimensionGuessFromWalls(p){
  const walls=p?.room?.walls||[];if(!walls.length)return{width:0,length:0};const xs=[],ys=[];for(const w of walls){xs.push(w.start.x,w.end.x);ys.push(w.start.y,w.end.y);}return{width:Math.max(...xs)-Math.min(...xs),length:Math.max(...ys)-Math.min(...ys)};
}

function installAreaBadge(){
  const heading=$('.left-panel .panel-heading');if(!heading||$('#roomAreaBadge'))return;const el=document.createElement('div');el.id='roomAreaBadge';el.style.cssText='font-size:10px;color:#667064;margin:-5px 2px 10px;padding:7px 9px;border:1px solid #ddd9cf;border-radius:8px;background:#f7f7f3;';heading.insertAdjacentElement('afterend',el);
  const update=()=>{const p=readProject(),a=roomAreaFromWalls(p);el.textContent=a?`Room area: ${(a/1e6).toFixed(2)} m²`:'Room area: —';};update();setInterval(update,800);
}

function installPlanAnalyzer(){
  const upload=$('#floorPlanInput')?.closest('.tool-card');if(!upload||$('#autoBuildPlanBtn'))return;
  const b=document.createElement('button');b.className='tool-card';b.id='autoBuildPlanBtn';b.innerHTML='<span class="tool-icon">AI</span><span><b>Auto-build from plan</b><small>Read dimensions and generate editable walls</small></span>';upload.insertAdjacentElement('afterend',b);
  b.onclick=analyzeFloorPlan;
}

function normalizeDimensionToken(token){
  let s=String(token).trim().replace(/\s/g,'');
  if(/^\d{1,3},\d{3}$/.test(s))s=s.replace(',','');else s=s.replace(',','.');
  let n=Number(s);if(!Number.isFinite(n)||n<=0)return null;
  if(n<20)n*=1000;else if(n<1000)n*=10;
  n=Math.round(n/10)*10;return n>=300&&n<=20000?n:null;
}

async function analyzeFloorPlan(){
  const p=readProject();if(!p?.floorPlan?.dataUrl){alert('Upload a floor plan image first.');return;}
  if(!window.Tesseract){alert('The plan-reading engine did not load. Refresh the page and try again.');return;}
  const btn=$('#autoBuildPlanBtn');btn.disabled=true;const original=btn.innerHTML;status('Reading floor-plan dimensions…');
  try{
    const result=await window.Tesseract.recognize(p.floorPlan.dataUrl,'eng',{logger:m=>{if(m.status==='recognizing text')status(`Reading floor plan… ${Math.round((m.progress||0)*100)}%`);}});
    const text=result?.data?.text||'';
    const tokens=text.match(/\b\d{1,5}(?:[.,]\d{1,3})?\b/g)||[];
    const dims=[...new Set(tokens.map(normalizeDimensionToken).filter(Boolean))].sort((a,b)=>b-a);
    if(dims.length<2){status('Could not reliably detect two room dimensions. Use Calibrate plan or Square / rectangle room.');alert('I could not reliably find two usable dimensions in this image. You can still calibrate the plan manually or use Square / rectangle room.');return;}
    const length=dims[0],width=dims[1],area=(length*width)/1e6;
    const ok=confirm(`Detected dominant dimensions:\n\n${length} mm × ${width} mm\nApprox. area: ${area.toFixed(2)} m²\n\nGenerate this editable rectangular room base?\n\nYou can edit every wall afterwards.`);
    if(!ok)return;
    if((p.room?.walls?.length||0)>0&&!confirm('Replace the current room walls? Existing cabinets will be cleared.'))return;
    buildRectangle(width,length,{source:'floor-plan-ocr'});status(`Plan base generated: ${length} × ${width} mm.`);location.reload();
  }catch(err){console.error(err);status('Floor-plan analysis failed.');alert('Automatic plan reading failed on this image. The uploaded plan is still available for manual calibration and tracing.');}
  finally{btn.disabled=false;btn.innerHTML=original;}
}

function setCategoryFromContext(){
  const c=$('#propertyContext')?.textContent?.trim().toLowerCase();if(c==='wall')state.category='walls';else if(c==='lighting')state.category='lights';else if(c==='cabinet')state.category='cabinets';else if(c==='appliance')state.category='appliances';
}

function installArchicadSelection(){
  const obs=new MutationObserver(setCategoryFromContext);const pc=$('#propertyContext');if(pc)obs.observe(pc,{childList:true,subtree:true,characterData:true});
  document.addEventListener('click',e=>{const tab=e.target.closest?.('.catalog-tab[data-cat]');if(tab){const cat=tab.dataset.cat;if(cat==='appliances')state.category='appliances';if(cat==='cabinets')state.category='cabinets';if(cat==='lighting')state.category='lights';}setTimeout(setCategoryFromContext,0);},true);
  window.addEventListener('keydown',e=>{
    if(!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='a'||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
    const p=readProject();if(!p)return;let ids=[];
    if(state.category==='walls')ids=(p.room?.walls||[]).map(x=>x.id);
    else if(state.category==='lights')ids=(p.room?.lighting||[]).map(x=>x.id);
    else if(state.category==='appliances')ids=(p.kitchen?.objects||[]).filter(x=>x.kind==='appliance'||x.category==='appliance').map(x=>x.id);
    else ids=(p.kitchen?.objects||[]).filter(x=>x.kind!=='appliance'&&x.category!=='appliance').map(x=>x.id);
    if(!ids.length)return;e.preventDefault();window.__ksMultiSelection={category:state.category,ids};refresh();status(`${ids.length} ${state.category} selected (Ctrl+A).`);
  });
  document.addEventListener('pointerdown',e=>{if(e.target?.id==='workspaceCanvas'&&!(e.ctrlKey||e.metaKey)){window.__ksMultiSelection={category:null,ids:[]};}},true);
}

installRectangleTool();installAreaBadge();installPlanAnalyzer();installArchicadSelection();
