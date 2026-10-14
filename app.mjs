import {
  STORAGE_KEY,CATALOG,newProject,normalizeProject,clone,addWall,wallLength,setWallLength,
  setWallConnection,setWallEndpoint,snapPoint,parseLength,formatLength,displayLength,
  roomPolygon,polygonArea,addLight,materialById
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
let pendingLightType=null;

function loadProject(){
  try{const raw=localStorage.getItem(STORAGE_KEY);return raw?normalizeProject(JSON.parse(raw)):newProject();}
  catch{return newProject();}
}
function persist(){project.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(project));}
function pushHistory(){history.push(clone(project));if(history.length>50)history.shift();}
function undo(){const prev=history.pop();if(!prev)return;project=prev;selectedId=null;renderer.selectedId=null;syncUI();persist();draw();message('Undo');}
function message(text){$('#statusMessage').textContent=text;}
function sizeCanvas(){const rect=canvas.parentElement.getBoundingClientRect();renderer.resize(rect.width,rect.height,window.devicePixelRatio||1);draw();}
function draw(){
  renderer.selectedId=selectedId;renderer.setView(activeView);renderer.draw(project);
  $('#projectStats').textContent=`${project.room.walls.length} walls · ${project.room.lighting.length} lights · ${project.kitchen.objects.length} objects`;
}

function setTool(tool){
  activeTool=tool;wallStart=null;renderer.tempWall=null;calibrationMode=false;renderer.calibrationPoints=[];
  if(tool!=='light') pendingLightType=null;
  $$('.tool-card[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  if(tool==='wall'){
    activeView='plan';setViewButtons();message('Wall tool: click start point, then end point.');
    $('#stageHint').textContent='Walls connect automatically when endpoints snap together. Double-click to finish the chain.';
  }else if(tool==='light'){
    activeView='plan';setViewButtons();message('Lighting placement: click the plan to place the selected fixture.');
    $('#stageHint').textContent='Click anywhere in the room to place the selected light. Exact position and drop can be edited afterwards.';
  }else{
    message('Select mode');$('#stageHint').textContent=project.room.walls.length?'Select a wall, light, floor or ceiling to edit it.':'Draw a wall or upload a floor plan to begin.';
  }
  draw();
}

function setView(view){
  activeView=view;renderer.setView(view);setViewButtons();
  $('#viewBadge').textContent=view==='plan'?'2D PLAN':view==='3d'?'INTERACTIVE 3D':'RENDER PREVIEW';
  if(view==='render')$('#stageHint').textContent='Render preview uses live room surfaces, lighting and project geometry.';
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
function selectedLight(){return project.room.lighting.find(l=>l.id===selectedId)||null;}
function surfaceType(){return selectedId==='surface:floor'?'floor':selectedId==='surface:ceiling'?'ceiling':null;}
function materialOptions(selected){return CATALOG.materials.map(m=>`<option value="${m.id}" ${m.id===selected?'selected':''}>${m.name}</option>`).join('');}

function renderProperties(){
  const panel=$('#propertiesPanel'),wall=selectedWall(),light=selectedLight(),surface=surfaceType();

  if(surface){renderSurfaceProperties(surface);return;}
  if(light){renderLightProperties(light);return;}
  if(!wall){panel.innerHTML='';$('#propertyContext').textContent='Project';return;}

  $('#propertyContext').textContent='Wall';
  const disabled=wall.locked?'disabled':'';
  panel.innerHTML=`<div class="prop-card"><h4>Wall geometry</h4>
    <div class="prop-row"><span>Length</span><input class="prop-input" id="propWallLength" ${disabled} value="${formatLength(wallLength(wall),'mm').replace(' mm','')}" /></div>
    <div class="prop-row"><span>Thickness</span><input class="prop-input" id="propWallThickness" ${disabled} value="${wall.thickness}" /></div>
    <div class="prop-row"><span>Height</span><input class="prop-input" id="propWallHeight" ${disabled} value="${wall.height}" /></div>
    <div class="prop-row"><span>Start X</span><input class="prop-input" id="propStartX" ${disabled} value="${Math.round(wall.start.x)}" /></div>
    <div class="prop-row"><span>Start Y</span><input class="prop-input" id="propStartY" ${disabled} value="${Math.round(wall.start.y)}" /></div>
    <div class="prop-row"><span>End X</span><input class="prop-input" id="propEndX" ${disabled} value="${Math.round(wall.end.x)}" /></div>
    <div class="prop-row"><span>End Y</span><input class="prop-input" id="propEndY" ${disabled} value="${Math.round(wall.end.y)}" /></div>
    <div class="prop-row"><span>Joints</span><select class="prop-input" id="propConnectionMode" ${disabled}><option value="connected" ${wall.connectionMode==='connected'?'selected':''}>Connected</option><option value="independent" ${wall.connectionMode==='independent'?'selected':''}>Independent</option></select></div>
    <div class="prop-row"><span>Lock wall</span><input type="checkbox" id="propWallLocked" ${wall.locked?'checked':''} /></div>
    <button class="btn ghost full" id="deleteWallBtn" ${wall.locked?'disabled':''} style="margin-top:10px;color:#8c4b3e">Delete wall</button></div>
    <div class="render-note">${wall.connectionMode==='connected'?'Connected endpoints move as one joint with adjacent connected walls.':'Independent wall ends remain separate even when they overlap another wall.'}<br>Displayed: ${displayLength(wallLength(wall),project.settings)}.</div>`;

  const guard=()=>{if(wall.locked){message('Wall is locked. Unlock it to edit geometry.');return true;}return false;};
  $('#propWallLength').addEventListener('change',e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<50){e.target.value=Math.round(wallLength(wall));return;}if(guard())return;pushHistory();if(!setWallLength(project,wall,v)){history.pop();message('This joint is fixed by a locked connected wall.');renderProperties();return;}persist();renderProperties();draw();});
  $('#propWallThickness').addEventListener('change',e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<20||guard())return;pushHistory();wall.thickness=v;persist();draw();});
  $('#propWallHeight').addEventListener('change',e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<200||guard())return;pushHistory();wall.height=v;persist();draw();});
  const editEndpoint=(key,axis,input)=>{const v=parseLength(input.value);if(!Number.isFinite(v)||guard())return;pushHistory();const p={x:wall[key].x,y:wall[key].y};p[axis]=v;if(!setWallEndpoint(project,wall,key,p)){history.pop();message('This joint is fixed by a locked connected wall.');renderProperties();return;}persist();renderProperties();draw();};
  $('#propStartX').addEventListener('change',e=>editEndpoint('start','x',e.target));
  $('#propStartY').addEventListener('change',e=>editEndpoint('start','y',e.target));
  $('#propEndX').addEventListener('change',e=>editEndpoint('end','x',e.target));
  $('#propEndY').addEventListener('change',e=>editEndpoint('end','y',e.target));
  $('#propConnectionMode').addEventListener('change',e=>{if(guard())return;pushHistory();setWallConnection(project,wall,e.target.value);persist();renderProperties();draw();message(e.target.value==='connected'?'Wall joints connected':'Wall ends are now independent');});
  $('#propWallLocked').addEventListener('change',e=>{pushHistory();wall.locked=e.target.checked;persist();renderProperties();draw();message(wall.locked?'Wall locked':'Wall unlocked');});
  $('#deleteWallBtn').addEventListener('click',()=>{if(wall.locked){message('Unlock the wall before deleting it.');return;}pushHistory();project.room.walls=project.room.walls.filter(w=>w.id!==wall.id);selectedId=null;persist();renderProperties();draw();message('Wall deleted');});
}

function renderSurfaceProperties(type){
  const panel=$('#propertiesPanel'),s=project.room.surfaces[type],poly=roomPolygon(project),area=polygonArea(poly);
  $('#propertyContext').textContent=type==='floor'?'Floor':'Ceiling';
  if(type==='floor'){
    const tiles=s.tileWidth>0&&s.tileHeight>0?Math.ceil((area/(s.tileWidth*s.tileHeight))*(1+(Number(s.waste)||0)/100)):0;
    panel.innerHTML=`<div class="prop-card"><h4>Floor surface</h4>
      <div class="prop-row"><span>Enabled</span><input type="checkbox" id="surfaceEnabled" ${s.enabled?'checked':''}></div>
      <div class="prop-row"><span>Material</span><select class="prop-input" id="surfaceMaterial">${materialOptions(s.materialId)}</select></div>
      <div class="prop-row"><span>Tile / plank W</span><input class="prop-input" id="tileW" value="${s.tileWidth}"></div>
      <div class="prop-row"><span>Tile / plank H</span><input class="prop-input" id="tileH" value="${s.tileHeight}"></div>
      <div class="prop-row"><span>Rotation °</span><input class="prop-input" id="surfaceRotation" type="number" value="${s.rotation||0}"></div>
      <div class="prop-row"><span>Grout / joint</span><input class="prop-input" id="surfaceGrout" value="${s.grout||0}"></div>
      <div class="prop-row"><span>Waste %</span><input class="prop-input" id="surfaceWaste" type="number" value="${s.waste||0}"></div></div>
      <div class="render-note">${poly?`Detected enclosed floor area: ${(area/1e6).toFixed(2)} m². Approx. ${tiles} pieces including ${s.waste||0}% waste.`:'Close the connected room walls to calculate and display the floor surface.'}</div>`;
  }else{
    panel.innerHTML=`<div class="prop-card"><h4>Ceiling surface</h4>
      <div class="prop-row"><span>Enabled</span><input type="checkbox" id="surfaceEnabled" ${s.enabled?'checked':''}></div>
      <div class="prop-row"><span>Material</span><select class="prop-input" id="surfaceMaterial">${materialOptions(s.materialId)}</select></div>
      <div class="prop-row"><span>Thickness</span><input class="prop-input" id="ceilingThickness" value="${s.thickness||20}"></div>
      <div class="prop-row"><span>Show in 3D</span><input type="checkbox" id="ceilingVisible" ${s.visible3d?'checked':''}></div></div>
      <div class="render-note">Ceiling follows the enclosed room footprint at ${formatLength(project.settings.ceilingHeight,'mm')}.</div>`;
  }
  $('#surfaceEnabled').addEventListener('change',e=>{pushHistory();s.enabled=e.target.checked;persist();renderProperties();draw();});
  $('#surfaceMaterial').addEventListener('change',e=>{pushHistory();s.materialId=e.target.value;s.colour=materialById(e.target.value)?.swatch||s.colour;persist();draw();});
  if(type==='floor'){
    const numeric=(id,key,min=0)=>$(id).addEventListener('change',e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<min)return;pushHistory();s[key]=v;persist();renderProperties();draw();});
    numeric('#tileW','tileWidth',10);numeric('#tileH','tileHeight',10);numeric('#surfaceGrout','grout',0);
    $('#surfaceRotation').addEventListener('change',e=>{pushHistory();s.rotation=Number(e.target.value)||0;persist();draw();});
    $('#surfaceWaste').addEventListener('change',e=>{pushHistory();s.waste=Math.max(0,Number(e.target.value)||0);persist();renderProperties();draw();});
  }else{
    $('#ceilingThickness').addEventListener('change',e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<1)return;pushHistory();s.thickness=v;persist();draw();});
    $('#ceilingVisible').addEventListener('change',e=>{pushHistory();s.visible3d=e.target.checked;persist();draw();});
  }
}

function renderLightProperties(light){
  const panel=$('#propertiesPanel');$('#propertyContext').textContent='Lighting';
  panel.innerHTML=`<div class="prop-card"><h4>${light.name}</h4>
    <div class="prop-row"><span>Enabled</span><input type="checkbox" id="lightEnabled" ${light.enabled?'checked':''}></div>
    <div class="prop-row"><span>X</span><input class="prop-input" id="lightX" value="${Math.round(light.x)}"></div>
    <div class="prop-row"><span>Y</span><input class="prop-input" id="lightY" value="${Math.round(light.y)}"></div>
    <div class="prop-row"><span>Drop</span><input class="prop-input" id="lightDrop" value="${light.drop}"></div>
    <div class="prop-row"><span>Size</span><input class="prop-input" id="lightDiameter" value="${light.diameter}"></div>
    <div class="prop-row"><span>Lumens</span><input class="prop-input" id="lightLumens" type="number" value="${light.lumens}"></div>
    <div class="prop-row"><span>Kelvin</span><input class="prop-input" id="lightKelvin" type="number" value="${light.kelvin}"></div>
    <button class="btn ghost full" id="deleteLightBtn" style="margin-top:10px;color:#8c4b3e">Delete light</button></div>
    <div class="render-note">Mounted from the project ceiling at ${formatLength(project.settings.ceilingHeight,'mm')}. Render preview uses the fixture's position and light temperature.</div>`;
  $('#lightEnabled').addEventListener('change',e=>{pushHistory();light.enabled=e.target.checked;persist();draw();});
  const edit=(id,key,min=-Infinity)=>$(id).addEventListener('change',e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<min)return;pushHistory();light[key]=v;persist();draw();});
  edit('#lightX','x');edit('#lightY','y');edit('#lightDrop','drop',0);edit('#lightDiameter','diameter',10);
  $('#lightLumens').addEventListener('change',e=>{pushHistory();light.lumens=Math.max(0,Number(e.target.value)||0);persist();draw();});
  $('#lightKelvin').addEventListener('change',e=>{pushHistory();light.kelvin=Math.max(1000,Number(e.target.value)||3000);persist();draw();});
  $('#deleteLightBtn').addEventListener('click',()=>{pushHistory();project.room.lighting=project.room.lighting.filter(l=>l.id!==light.id);selectedId=null;persist();renderProperties();draw();message('Light deleted');});
}

function renderCatalog(){
  const active=$('.catalog-tab.active')?.dataset.cat||'cabinets',q=$('#catalogSearch').value.trim().toLowerCase();
  const items=(CATALOG[active]||[]).filter(i=>`${i.name} ${i.meta}`.toLowerCase().includes(q));
  $('#catalogList').innerHTML=items.map(i=>`<div class="catalog-card" data-cat="${active}" data-id="${i.id}" title="${active==='lighting'?'Click, then place it in the 2D plan.':active==='materials'?'Click to apply to selected floor or ceiling.':'Parametric placement follows in the cabinet engine.'}"><div class="swatch" style="background:${i.swatch}"></div><b>${i.name}</b><small>${i.meta}</small></div>`).join('');
  $$('#catalogList .catalog-card').forEach(card=>card.addEventListener('click',()=>handleCatalogItem(card.dataset.cat,card.dataset.id)));
}

function handleCatalogItem(category,id){
  if(category==='lighting'){
    pendingLightType=id;setTool('light');
    message(`${CATALOG.lighting.find(x=>x.id===id)?.name||'Light'} selected. Click the 2D plan to place it.`);
    return;
  }
  if(category==='materials'&&surfaceType()){
    const s=project.room.surfaces[surfaceType()],m=materialById(id);pushHistory();s.materialId=id;s.colour=m?.swatch||s.colour;persist();renderProperties();draw();message(`${m?.name||'Material'} applied to ${surfaceType()}.`);
  }
}

function pointerPos(ev){const r=canvas.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};}

canvas.addEventListener('pointerdown',ev=>{
  const s=pointerPos(ev);pointerDown=s;canvas.setPointerCapture?.(ev.pointerId);
  if(activeView!=='plan'){panStart={x:s.x,y:s.y,yaw:renderer.camera.yaw,pitch:renderer.camera.pitch};return;}
  const world=renderer.screenToWorld(s);
  if(calibrationMode){renderer.calibrationPoints.push(world);if(renderer.calibrationPoints.length===2){draw();setTimeout(finishCalibration,0);}else{message('Calibration: choose the second point.');draw();}return;}
  if(activeTool==='light'&&pendingLightType){pushHistory();const light=addLight(project,pendingLightType,snapPoint(world,project,40));selectedId=light.id;renderer.selectedId=selectedId;persist();renderProperties();draw();message(`${light.name} placed. Click again to place another, or press Esc.`);return;}
  if(activeTool==='wall'){
    const snapped=snapPoint(world,project);
    if(!wallStart){wallStart=snapped;renderer.tempWall={start:snapped,end:snapped};message('Choose wall end point.');}
    else{
      const end=snapped;
      if(Math.hypot(end.x-wallStart.x,end.y-wallStart.y)>=50){pushHistory();const w=addWall(project,wallStart,end,{connectionMode:'connected'});selectedId=w.id;renderer.selectedId=w.id;persist();wallStart={x:w.end.x,y:w.end.y};renderer.tempWall={start:wallStart,end:wallStart};renderProperties();message(`Connected wall created · ${displayLength(wallLength(w),project.settings)}`);}
    }
    draw();return;
  }
  const lightHit=renderer.hitLight(project,s,14);
  if(lightHit){selectedId=lightHit.id;renderer.selectedId=selectedId;renderProperties();draw();return;}
  const hit=renderer.hitWall(project,s,14);selectedId=hit?.id||null;renderer.selectedId=selectedId;renderProperties();draw();if(!hit)panStart={x:s.x,y:s.y,cx:renderer.camera.cx,cy:renderer.camera.cy};
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
$('#floorSurfaceBtn').addEventListener('click',()=>{selectedId='surface:floor';renderer.selectedId=selectedId;setTool('select');renderProperties();draw();message('Floor selected. Close the room walls to generate its footprint.');});
$('#ceilingSurfaceBtn').addEventListener('click',()=>{selectedId='surface:ceiling';renderer.selectedId=selectedId;setTool('select');renderProperties();draw();message('Ceiling selected. It follows the enclosed room footprint.');});
$$('.view-btn').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('#undoBtn').addEventListener('click',undo);

$('#newProjectBtn').addEventListener('click',()=>{if(!confirm('Create a new blank project? The current project remains recoverable only if exported.'))return;pushHistory();project=newProject();selectedId=null;floorImage=null;renderer.setFloorImage(null);renderer.camera={...renderer.camera,cx:0,cy:0,zoom:0.16};persist();syncUI();setView('plan');draw();});
$('#saveProjectBtn').addEventListener('click',()=>{persist();message('Project saved locally');});
$('#projectNameInput').addEventListener('input',e=>{project.name=e.target.value;persist();});
$('#ceilingHeightInput').addEventListener('change',e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<1800)return;pushHistory();project.settings.ceilingHeight=v;project.room.lighting.forEach(l=>l.ceilingHeight=v);persist();renderProperties();draw();});
$('#wallThicknessInput').addEventListener('change',e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<20)return;project.settings.defaultWallThickness=v;persist();});
$('#unitSelect').addEventListener('change',e=>{project.settings.primaryUnit=e.target.value;persist();renderProperties();draw();});
$('#secondaryInchesToggle').addEventListener('change',e=>{project.settings.secondaryInches=e.target.checked;persist();renderProperties();draw();});
$('#planOpacityInput').addEventListener('input',e=>{if(project.floorPlan){project.floorPlan.opacity=Number(e.target.value)/100;persist();draw();}});

$('#floorPlanInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  if(!file.type.startsWith('image/')){alert('Foundation currently supports PNG/JPG/WebP plan underlays. PDF vector import is planned in the import pipeline.');return;}
  const data=await fileToDataURL(file),img=new Image();
  img.onload=()=>{floorImage=img;renderer.setFloorImage(img);pushHistory();project.floorPlan={name:file.name,dataUrl:data,mmPerPixel:5,x:0,y:0,opacity:0.45,widthPx:img.naturalWidth,heightPx:img.naturalHeight};persist();renderer.fit(project);syncUI();setView('plan');draw();message('Floor plan uploaded. Calibrate it with a known dimension.');};
  img.src=data;
});

$('#calibrateBtn').addEventListener('click',()=>{if(!project.floorPlan||!floorImage){alert('Upload a floor plan image first.');return;}setTool('select');calibrationMode=true;renderer.calibrationPoints=[];message('Calibration: click the first point on a known dimension.');$('#stageHint').textContent='Calibration mode: click two points that have a known real-world distance.';});
function finishCalibration(){const pts=renderer.calibrationPoints;if(pts.length!==2)return;const shown=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);const input=prompt('Enter the real distance between these two points (for example: 3650 mm, 365 cm, 3.65 m, or 143.7 in):','1000 mm');const real=parseLength(input);if(Number.isFinite(real)&&real>0&&shown>0){pushHistory();const ratio=real/shown;project.floorPlan.mmPerPixel*=ratio;const mx=(pts[0].x+pts[1].x)/2,my=(pts[0].y+pts[1].y)/2;project.floorPlan.x=mx+(project.floorPlan.x-mx)*ratio;project.floorPlan.y=my+(project.floorPlan.y-my)*ratio;persist();message(`Plan calibrated · ${formatLength(real,'mm')}`);}else message('Calibration cancelled');calibrationMode=false;renderer.calibrationPoints=[];draw();}

$('#removePlanBtn').addEventListener('click',()=>{if(!project.floorPlan)return;pushHistory();project.floorPlan=null;floorImage=null;renderer.setFloorImage(null);persist();draw();message('Floor plan reference removed');});
$('#clearPlanBtn').addEventListener('click',()=>{if(!project.room.walls.length)return;if(!confirm('Remove all room walls?'))return;pushHistory();project.room.walls=[];selectedId=null;persist();renderProperties();draw();message('Room cleared');});
$('#exportProjectBtn').addEventListener('click',()=>downloadBlob(`${safeName(project.name)}.kitchen.json`,JSON.stringify(project,null,2),'application/json'));
$('#importProjectInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const value=normalizeProject(JSON.parse(await file.text()));pushHistory();project=value;selectedId=null;if(project.floorPlan?.dataUrl){const img=new Image();img.onload=()=>{floorImage=img;renderer.setFloorImage(img);renderer.fit(project);draw();};img.src=project.floorPlan.dataUrl;}else{floorImage=null;renderer.setFloorImage(null);}persist();syncUI();renderer.fit(project);draw();message('Project imported');}catch(err){alert(err.message||'Could not import project.');}});
$('#exportImageBtn').addEventListener('click',()=>{draw();canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${safeName(project.name)}-${activeView}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png',1);});
$$('.catalog-tab').forEach(btn=>btn.addEventListener('click',()=>{$$('.catalog-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderCatalog();}));
$('#catalogSearch').addEventListener('input',renderCatalog);

function fileToDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
function safeName(s){return String(s||'project').trim().replace(/[^\w\-]+/g,'-').replace(/^-+|-+$/g,'')||'project';}
function downloadBlob(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function restoreFloorImage(){if(!project.floorPlan?.dataUrl)return;const img=new Image();await new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;img.src=project.floorPlan.dataUrl;});if(img.naturalWidth){floorImage=img;renderer.setFloorImage(img);}}
window.addEventListener('resize',sizeCanvas);
await restoreFloorImage();syncUI();requestAnimationFrame(()=>{sizeCanvas();if(project.room.walls.length)renderer.fit(project);draw();});
