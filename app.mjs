import {
  STORAGE_KEY,CATALOG,newProject,normalizeProject,clone,addWall,wallLength,setWallLength,
  snapPoint,parseLength,formatLength,displayLength
} from './model.mjs';
import {StudioRenderer} from './render.mjs';

const $=sel=>document.querySelector(sel);
const $$=sel=>[...document.querySelectorAll(sel)];
const canvas=$('#workspaceCanvas');
const renderer=new StudioRenderer(canvas);

let project=loadProject();
let selectedId=null;
let activeTool='select';
let activeView='plan';
let wallStart=null;
let pointerDown=null;
let panStart=null;
let history=[];
let floorImage=null;
let calibrationMode=false;

function loadProject(){
  try{const raw=localStorage.getItem(STORAGE_KEY);return raw?normalizeProject(JSON.parse(raw)):newProject();}
  catch{return newProject();}
}
function persist(){project.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(project));}
function pushHistory(){history.push(clone(project));if(history.length>50)history.shift();}
function undo(){const prev=history.pop();if(!prev)return;project=prev;selectedId=null;renderer.selectedId=null;syncUI();persist();draw();message('Undo');}
function message(text){$('#statusMessage').textContent=text;}
function sizeCanvas(){const rect=canvas.parentElement.getBoundingClientRect();renderer.resize(rect.width,rect.height,window.devicePixelRatio||1);draw();}
function draw(){renderer.selectedId=selectedId;renderer.setView(activeView);renderer.draw(project);$('#projectStats').textContent=`${project.room.walls.length} walls · ${project.kitchen.objects.length} objects`;}

function setTool(tool){
  activeTool=tool;wallStart=null;renderer.tempWall=null;calibrationMode=false;renderer.calibrationPoints=[];
  $$('.tool-card[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  if(tool==='wall'){
    activeView='plan';setViewButtons();message('Wall tool: click start point, then end point.');
    $('#stageHint').textContent='Click start and end points. Wall lengths remain fully editable.';
  }else{
    message('Select mode');$('#stageHint').textContent=project.room.walls.length?'Select a wall to edit exact dimensions.':'Draw a wall or upload a floor plan to begin.';
  }
  draw();
}

function setView(view){
  activeView=view;renderer.setView(view);setViewButtons();
  $('#viewBadge').textContent=view==='plan'?'2D PLAN':view==='3d'?'INTERACTIVE 3D':'RENDER PREVIEW';
  if(view==='render')$('#stageHint').textContent='Render preview uses the same live project geometry. High-quality rendering pipeline follows this scene model.';
  else if(view==='3d')$('#stageHint').textContent='3D is generated directly from the editable project geometry.';
  else $('#stageHint').textContent='Draw, measure and edit the room in millimetres.';
  draw();
}
function setViewButtons(){$$('.view-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===activeView));}

function syncUI(){
  $('#projectNameInput').value=project.name;
  $('#ceilingHeightInput').value=project.settings.ceilingHeight;
  $('#wallThicknessInput').value=project.settings.defaultWallThickness;
  $('#unitSelect').value=project.settings.primaryUnit;
  $('#secondaryInchesToggle').checked=!!project.settings.secondaryInches;
  $('#planOpacityInput').value=Math.round((project.floorPlan?.opacity??0.45)*100);
  renderProperties();renderCatalog();
}
function selectedWall(){return project.room.walls.find(w=>w.id===selectedId)||null;}

function renderProperties(){
  const panel=$('#propertiesPanel'),wall=selectedWall();
  if(!wall){panel.innerHTML='';$('#propertyContext').textContent='Project';return;}
  $('#propertyContext').textContent='Wall';
  panel.innerHTML=`<div class="prop-card"><h4>Wall geometry</h4>
    <div class="prop-row"><span>Length</span><input class="prop-input" id="propWallLength" value="${formatLength(wallLength(wall),'mm').replace(' mm','')}" /></div>
    <div class="prop-row"><span>Thickness</span><input class="prop-input" id="propWallThickness" value="${wall.thickness}" /></div>
    <div class="prop-row"><span>Height</span><input class="prop-input" id="propWallHeight" value="${wall.height}" /></div>
    <div class="prop-row"><span>Start X</span><input class="prop-input" id="propStartX" value="${Math.round(wall.start.x)}" /></div>
    <div class="prop-row"><span>Start Y</span><input class="prop-input" id="propStartY" value="${Math.round(wall.start.y)}" /></div>
    <button class="btn ghost full" id="deleteWallBtn" style="margin-top:10px;color:#8c4b3e">Delete wall</button></div>
    <div class="render-note">Displayed: ${displayLength(wallLength(wall),project.settings)}. Internal geometry remains stored in millimetres.</div>`;
  $('#propWallLength').addEventListener('change',e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<50){e.target.value=Math.round(wallLength(wall));return;}pushHistory();setWallLength(wall,v);persist();renderProperties();draw();});
  $('#propWallThickness').addEventListener('change',e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<20)return;pushHistory();wall.thickness=v;persist();draw();});
  $('#propWallHeight').addEventListener('change',e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<200)return;pushHistory();wall.height=v;persist();draw();});
  $('#propStartX').addEventListener('change',e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v))return;pushHistory();const dx=v-wall.start.x;wall.start.x=v;wall.end.x+=dx;persist();draw();});
  $('#propStartY').addEventListener('change',e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v))return;pushHistory();const dy=v-wall.start.y;wall.start.y=v;wall.end.y+=dy;persist();draw();});
  $('#deleteWallBtn').addEventListener('click',()=>{pushHistory();project.room.walls=project.room.walls.filter(w=>w.id!==wall.id);selectedId=null;persist();renderProperties();draw();message('Wall deleted');});
}

function renderCatalog(){
  const active=$('.catalog-tab.active')?.dataset.cat||'cabinets',q=$('#catalogSearch').value.trim().toLowerCase();
  const items=(CATALOG[active]||[]).filter(i=>`${i.name} ${i.meta}`.toLowerCase().includes(q));
  $('#catalogList').innerHTML=items.map(i=>`<div class="catalog-card" title="Catalog architecture is active; drag/drop cabinet placement is the next implementation layer."><div class="swatch" style="background:${i.swatch}"></div><b>${i.name}</b><small>${i.meta}</small></div>`).join('');
}

function pointerPos(ev){const r=canvas.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};}

canvas.addEventListener('pointerdown',ev=>{
  const s=pointerPos(ev);pointerDown=s;canvas.setPointerCapture?.(ev.pointerId);
  if(activeView!=='plan'){panStart={x:s.x,y:s.y,yaw:renderer.camera.yaw,pitch:renderer.camera.pitch};return;}
  const world=renderer.screenToWorld(s);
  if(calibrationMode){
    renderer.calibrationPoints.push(world);
    if(renderer.calibrationPoints.length===2){draw();setTimeout(finishCalibration,0);}else{message('Calibration: choose the second point.');draw();}
    return;
  }
  if(activeTool==='wall'){
    const snapped=snapPoint(world,project);
    if(!wallStart){wallStart=snapped;renderer.tempWall={start:snapped,end:snapped};message('Choose wall end point.');}
    else{
      const end=snapped;
      if(Math.hypot(end.x-wallStart.x,end.y-wallStart.y)>=50){pushHistory();const w=addWall(project,wallStart,end);selectedId=w.id;renderer.selectedId=w.id;persist();wallStart=end;renderer.tempWall={start:end,end:end};renderProperties();message(`Wall created · ${displayLength(wallLength(w),project.settings)}`);}
    }
    draw();return;
  }
  const hit=renderer.hitWall(project,s,14);selectedId=hit?.id||null;renderer.selectedId=selectedId;renderProperties();draw();
  if(!hit)panStart={x:s.x,y:s.y,cx:renderer.camera.cx,cy:renderer.camera.cy};
});

canvas.addEventListener('pointermove',ev=>{
  const s=pointerPos(ev);
  if(activeView==='plan'){
    const w=renderer.screenToWorld(s);$('#cursorReadout').textContent=`X ${Math.round(w.x)} mm · Y ${Math.round(w.y)} mm`;
    if(activeTool==='wall'&&wallStart){renderer.tempWall={start:wallStart,end:snapPoint(w,project)};draw();}
    if(pointerDown&&panStart&&activeTool==='select'&&!selectedId){const dx=s.x-panStart.x,dy=s.y-panStart.y;renderer.camera.cx=panStart.cx-dx/renderer.camera.zoom;renderer.camera.cy=panStart.cy-dy/renderer.camera.zoom;draw();}
  }else if(pointerDown&&panStart){const dx=s.x-panStart.x,dy=s.y-panStart.y;renderer.camera.yaw=panStart.yaw+dx*0.006;renderer.camera.pitch=Math.max(0.15,Math.min(1.25,panStart.pitch+dy*0.004));draw();}
});
canvas.addEventListener('pointerup',()=>{pointerDown=null;panStart=null;});
canvas.addEventListener('dblclick',()=>{if(activeTool==='wall'){wallStart=null;renderer.tempWall=null;message('Wall chain finished.');draw();}});
canvas.addEventListener('wheel',ev=>{ev.preventDefault();if(activeView==='plan'){const before=renderer.screenToWorld(pointerPos(ev)),factor=ev.deltaY<0?1.12:0.89;renderer.camera.zoom=Math.max(0.02,Math.min(2,renderer.camera.zoom*factor));const after=renderer.screenToWorld(pointerPos(ev));renderer.camera.cx+=before.x-after.x;renderer.camera.cy+=before.y-after.y;draw();}},{passive:false});

window.addEventListener('keydown',ev=>{if(ev.key==='Escape'){wallStart=null;renderer.tempWall=null;calibrationMode=false;renderer.calibrationPoints=[];setTool('select');draw();}if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){ev.preventDefault();undo();}});

$('#selectTool').addEventListener('click',()=>setTool('select'));
$('#wallTool').addEventListener('click',()=>setTool('wall'));
$$('.view-btn').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('#undoBtn').addEventListener('click',undo);

$('#newProjectBtn').addEventListener('click',()=>{if(!confirm('Create a new blank project? The current project remains recoverable only if exported.'))return;pushHistory();project=newProject();selectedId=null;floorImage=null;renderer.setFloorImage(null);renderer.camera={...renderer.camera,cx:0,cy:0,zoom:0.16};persist();syncUI();setView('plan');draw();});
$('#saveProjectBtn').addEventListener('click',()=>{persist();message('Project saved locally');});
$('#projectNameInput').addEventListener('input',e=>{project.name=e.target.value;persist();});
$('#ceilingHeightInput').addEventListener('change',e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<1800)return;pushHistory();project.settings.ceilingHeight=v;persist();draw();});
$('#wallThicknessInput').addEventListener('change',e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<20)return;project.settings.defaultWallThickness=v;persist();});
$('#unitSelect').addEventListener('change',e=>{project.settings.primaryUnit=e.target.value;persist();renderProperties();draw();});
$('#secondaryInchesToggle').addEventListener('change',e=>{project.settings.secondaryInches=e.target.checked;persist();renderProperties();draw();});
$('#planOpacityInput').addEventListener('input',e=>{if(project.floorPlan){project.floorPlan.opacity=Number(e.target.value)/100;persist();draw();}});

$('#floorPlanInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  if(!file.type.startsWith('image/')){alert('Foundation v0.1 currently supports PNG/JPG/WebP plan underlays. PDF vector import is planned in the import pipeline.');return;}
  const data=await fileToDataURL(file),img=new Image();
  img.onload=()=>{floorImage=img;renderer.setFloorImage(img);pushHistory();project.floorPlan={name:file.name,dataUrl:data,mmPerPixel:5,x:0,y:0,opacity:0.45,widthPx:img.naturalWidth,heightPx:img.naturalHeight};persist();renderer.fit(project);syncUI();setView('plan');draw();message('Floor plan uploaded. Calibrate it with a known dimension.');};
  img.src=data;
});

$('#calibrateBtn').addEventListener('click',()=>{if(!project.floorPlan||!floorImage){alert('Upload a floor plan image first.');return;}setTool('select');calibrationMode=true;renderer.calibrationPoints=[];message('Calibration: click the first point on a known dimension.');$('#stageHint').textContent='Calibration mode: click two points that have a known real-world distance.';});

function finishCalibration(){
  const pts=renderer.calibrationPoints;if(pts.length!==2)return;
  const shown=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);
  const input=prompt('Enter the real distance between these two points (for example: 3650 mm, 365 cm, 3.65 m, or 143.7 in):','1000 mm');
  const real=parseLength(input);
  if(Number.isFinite(real)&&real>0&&shown>0){pushHistory();const ratio=real/shown;project.floorPlan.mmPerPixel*=ratio;const mx=(pts[0].x+pts[1].x)/2,my=(pts[0].y+pts[1].y)/2;project.floorPlan.x=mx+(project.floorPlan.x-mx)*ratio;project.floorPlan.y=my+(project.floorPlan.y-my)*ratio;persist();message(`Plan calibrated · ${formatLength(real,'mm')}`);}else message('Calibration cancelled');
  calibrationMode=false;renderer.calibrationPoints=[];draw();
}

$('#removePlanBtn').addEventListener('click',()=>{if(!project.floorPlan)return;pushHistory();project.floorPlan=null;floorImage=null;renderer.setFloorImage(null);persist();draw();message('Floor plan reference removed');});
$('#clearPlanBtn').addEventListener('click',()=>{if(!project.room.walls.length)return;if(!confirm('Remove all room walls?'))return;pushHistory();project.room.walls=[];selectedId=null;persist();renderProperties();draw();message('Room cleared');});
$('#exportProjectBtn').addEventListener('click',()=>downloadBlob(`${safeName(project.name)}.kitchen.json`,JSON.stringify(project,null,2),'application/json'));

$('#importProjectInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    const value=normalizeProject(JSON.parse(await file.text()));pushHistory();project=value;selectedId=null;
    if(project.floorPlan?.dataUrl){const img=new Image();img.onload=()=>{floorImage=img;renderer.setFloorImage(img);renderer.fit(project);draw();};img.src=project.floorPlan.dataUrl;}else{floorImage=null;renderer.setFloorImage(null);}
    persist();syncUI();renderer.fit(project);draw();message('Project imported');
  }catch(err){alert(err.message||'Could not import project.');}
});

$('#exportImageBtn').addEventListener('click',()=>{draw();canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${safeName(project.name)}-${activeView}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png',1);});
$$('.catalog-tab').forEach(btn=>btn.addEventListener('click',()=>{$$('.catalog-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderCatalog();}));
$('#catalogSearch').addEventListener('input',renderCatalog);

function fileToDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
function safeName(s){return String(s||'project').trim().replace(/[^\w\-]+/g,'-').replace(/^-+|-+$/g,'')||'project';}
function downloadBlob(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function restoreFloorImage(){if(!project.floorPlan?.dataUrl)return;const img=new Image();await new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;img.src=project.floorPlan.dataUrl;});if(img.naturalWidth){floorImage=img;renderer.setFloorImage(img);}}
window.addEventListener('resize',sizeCanvas);
await restoreFloorImage();syncUI();requestAnimationFrame(()=>{sizeCanvas();if(project.room.walls.length)renderer.fit(project);draw();});
