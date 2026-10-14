import {
  STORAGE_KEY,CATALOG,newProject,normalizeProject,clone,addWall,wallLength,setWallLength,
  setWallConnection,setWallEndpoint,snapPoint,parseLength,formatLength,displayLength,
  roomPolygon,polygonArea,addLight,materialById
} from './model.mjs';
import {StudioRenderer} from './render.mjs';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const canvas=$('#workspaceCanvas'),renderer=new StudioRenderer(canvas);
let project=loadProject(),selectedId=null,activeTool='select',activeView='plan',wallStart=null,pointerDown=null,panStart=null,history=[],floorImage=null,calibrationMode=false,pendingLightType=null,ceilingDraft=[];

function loadProject(){try{const raw=localStorage.getItem(STORAGE_KEY);return raw?normalizeProject(JSON.parse(raw)):newProject();}catch{return newProject();}}
function persist(){project.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(project));}
function pushHistory(){history.push(clone(project));if(history.length>50)history.shift();}
function undo(){const prev=history.pop();if(!prev)return;project=prev;selectedId=null;renderer.selectedId=null;renderer.tempCeiling=null;ceilingDraft=[];syncUI();persist();draw();message('Undo');}
function message(t){$('#statusMessage').textContent=t;}
function sizeCanvas(){const r=canvas.parentElement.getBoundingClientRect();renderer.resize(r.width,r.height,window.devicePixelRatio||1);draw();}
function draw(){renderer.selectedId=selectedId;renderer.setView(activeView);renderer.draw(project);$('#projectStats').textContent=`${project.room.walls.length} walls · ${project.room.lighting.length} lights · ${project.kitchen.objects.length} objects`;}
function setViewButtons(){$$('.view-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===activeView));}

function setTool(tool){
  activeTool=tool;wallStart=null;renderer.tempWall=null;calibrationMode=false;renderer.calibrationPoints=[];
  if(tool!=='light')pendingLightType=null;
  if(tool!=='ceiling'){ceilingDraft=[];renderer.tempCeiling=null;}
  $$('.tool-card[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  if(tool==='wall'){
    activeView='plan';setViewButtons();message('Wall tool: click start point, then end point.');$('#stageHint').textContent='Walls connect automatically when endpoints snap together. Double-click to finish the chain.';
  }else if(tool==='light'){
    activeView='plan';setViewButtons();message('Lighting placement: click the plan to place the selected fixture.');$('#stageHint').textContent='Click anywhere in the room to place the selected light.';
  }else if(tool==='ceiling'){
    activeView='plan';setViewButtons();selectedId='surface:ceiling';renderer.selectedId=selectedId;message('Ceiling tool: click points around the ceiling area. Click the first point again or double-click to finish.');$('#stageHint').textContent='Draw the ceiling as its own polygon. It can extend over wall thickness or cover only part of the room.';
  }else{
    message('Select mode');$('#stageHint').textContent=project.room.walls.length?'Select a wall, light, floor or ceiling to edit it.':'Draw a wall or upload a floor plan to begin.';
  }
  renderProperties();draw();
}
function setView(view){activeView=view;renderer.setView(view);setViewButtons();$('#viewBadge').textContent=view==='plan'?'2D PLAN':view==='3d'?'INTERACTIVE 3D':'RENDER PREVIEW';$('#stageHint').textContent=view==='render'?'Render preview uses live room surfaces, lighting and project geometry.':view==='3d'?'3D is generated directly from the editable project geometry.':'Draw, measure and edit the room in millimetres.';draw();}
function syncUI(){$('#projectNameInput').value=project.name;$('#ceilingHeightInput').value=project.settings.ceilingHeight;$('#wallThicknessInput').value=project.settings.defaultWallThickness;$('#unitSelect').value=project.settings.primaryUnit;$('#secondaryInchesToggle').checked=!!project.settings.secondaryInches;$('#planOpacityInput').value=Math.round((project.floorPlan?.opacity??.45)*100);renderProperties();renderCatalog();}
function selectedWall(){return project.room.walls.find(w=>w.id===selectedId)||null;}
function selectedLight(){return project.room.lighting.find(l=>l.id===selectedId)||null;}
function surfaceType(){return selectedId==='surface:floor'?'floor':selectedId==='surface:ceiling'?'ceiling':null;}
function materialOptions(sel){return CATALOG.materials.map(m=>`<option value="${m.id}" ${m.id===sel?'selected':''}>${m.name}</option>`).join('');}
function ceilingPoly(){const p=project.room.surfaces.ceiling.polygon;return Array.isArray(p)&&p.length>=3?p:roomPolygon(project);}

function renderProperties(){
  const panel=$('#propertiesPanel'),wall=selectedWall(),light=selectedLight(),surface=surfaceType();
  if(surface){renderSurfaceProperties(surface);return;}if(light){renderLightProperties(light);return;}if(!wall){panel.innerHTML='';$('#propertyContext').textContent='Project';return;}
  $('#propertyContext').textContent='Wall';const dis=wall.locked?'disabled':'';
  panel.innerHTML=`<div class="prop-card"><h4>Wall geometry</h4>
  <div class="prop-row"><span>Length</span><input class="prop-input" id="propWallLength" ${dis} value="${Math.round(wallLength(wall))}"></div>
  <div class="prop-row"><span>Thickness</span><input class="prop-input" id="propWallThickness" ${dis} value="${wall.thickness}"></div>
  <div class="prop-row"><span>Height</span><input class="prop-input" id="propWallHeight" ${dis} value="${wall.height}"></div>
  <div class="prop-row"><span>Start X</span><input class="prop-input" id="propStartX" ${dis} value="${Math.round(wall.start.x)}"></div><div class="prop-row"><span>Start Y</span><input class="prop-input" id="propStartY" ${dis} value="${Math.round(wall.start.y)}"></div>
  <div class="prop-row"><span>End X</span><input class="prop-input" id="propEndX" ${dis} value="${Math.round(wall.end.x)}"></div><div class="prop-row"><span>End Y</span><input class="prop-input" id="propEndY" ${dis} value="${Math.round(wall.end.y)}"></div>
  <div class="prop-row"><span>Joints</span><select class="prop-input" id="propConnectionMode" ${dis}><option value="connected" ${wall.connectionMode==='connected'?'selected':''}>Connected</option><option value="independent" ${wall.connectionMode==='independent'?'selected':''}>Independent</option></select></div>
  <div class="prop-row"><span>Lock wall</span><input type="checkbox" id="propWallLocked" ${wall.locked?'checked':''}></div><button class="btn ghost full" id="deleteWallBtn" ${wall.locked?'disabled':''} style="margin-top:10px;color:#8c4b3e">Delete wall</button></div>`;
  const guard=()=>wall.locked;
  $('#propWallLength').onchange=e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<50||guard())return;pushHistory();if(!setWallLength(project,wall,v)){history.pop();return;}persist();renderProperties();draw();};
  $('#propWallThickness').onchange=e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<20||guard())return;pushHistory();wall.thickness=v;persist();draw();};
  $('#propWallHeight').onchange=e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<200||guard())return;pushHistory();wall.height=v;persist();draw();};
  const ep=(key,axis,input)=>{const v=parseLength(input.value);if(!Number.isFinite(v)||guard())return;pushHistory();const p={...wall[key]};p[axis]=v;if(!setWallEndpoint(project,wall,key,p)){history.pop();return;}persist();renderProperties();draw();};
  $('#propStartX').onchange=e=>ep('start','x',e.target);$('#propStartY').onchange=e=>ep('start','y',e.target);$('#propEndX').onchange=e=>ep('end','x',e.target);$('#propEndY').onchange=e=>ep('end','y',e.target);
  $('#propConnectionMode').onchange=e=>{if(guard())return;pushHistory();setWallConnection(project,wall,e.target.value);persist();renderProperties();draw();};
  $('#propWallLocked').onchange=e=>{pushHistory();wall.locked=e.target.checked;persist();renderProperties();draw();};
  $('#deleteWallBtn').onclick=()=>{if(wall.locked)return;pushHistory();project.room.walls=project.room.walls.filter(w=>w.id!==wall.id);selectedId=null;persist();renderProperties();draw();};
}

function renderSurfaceProperties(type){
  const panel=$('#propertiesPanel'),s=project.room.surfaces[type],poly=type==='ceiling'?ceilingPoly():roomPolygon(project),area=polygonArea(poly);$('#propertyContext').textContent=type==='floor'?'Floor':'Ceiling';
  if(type==='floor'){
    const pieces=s.tileWidth>0&&s.tileHeight>0?Math.ceil((area/(s.tileWidth*s.tileHeight))*(1+(Number(s.waste)||0)/100)):0;
    panel.innerHTML=`<div class="prop-card"><h4>Floor surface</h4><div class="prop-row"><span>Enabled</span><input type="checkbox" id="surfaceEnabled" ${s.enabled?'checked':''}></div><div class="prop-row"><span>Material</span><select class="prop-input" id="surfaceMaterial">${materialOptions(s.materialId)}</select></div><div class="prop-row"><span>Tile / plank W</span><input class="prop-input" id="tileW" value="${s.tileWidth}"></div><div class="prop-row"><span>Tile / plank H</span><input class="prop-input" id="tileH" value="${s.tileHeight}"></div><div class="prop-row"><span>Rotation °</span><input class="prop-input" id="surfaceRotation" type="number" value="${s.rotation||0}"></div><div class="prop-row"><span>Grout / joint</span><input class="prop-input" id="surfaceGrout" value="${s.grout||0}"></div><div class="prop-row"><span>Waste %</span><input class="prop-input" id="surfaceWaste" type="number" value="${s.waste||0}"></div></div><div class="render-note">${poly?`Area ${(area/1e6).toFixed(2)} m² · approx. ${pieces} pieces.`:'Close the connected room walls to generate the floor.'}</div>`;
  }else{
    const custom=Array.isArray(s.polygon)&&s.polygon.length>=3;
    panel.innerHTML=`<div class="prop-card"><h4>Ceiling surface</h4><div class="prop-row"><span>Enabled</span><input type="checkbox" id="surfaceEnabled" ${s.enabled?'checked':''}></div><div class="prop-row"><span>Material</span><select class="prop-input" id="surfaceMaterial">${materialOptions(s.materialId)}</select></div><div class="prop-row"><span>Thickness</span><input class="prop-input" id="ceilingThickness" value="${s.thickness||20}"></div><div class="prop-row"><span>Show in 3D</span><input type="checkbox" id="ceilingVisible" ${s.visible3d?'checked':''}></div><button class="btn ghost full" id="redrawCeilingBtn" style="margin-top:10px">Draw / redraw ceiling</button><button class="btn ghost full" id="autoCeilingBtn" style="margin-top:8px">Use room footprint</button></div><div class="render-note">${custom?`Custom ceiling zone · ${(area/1e6).toFixed(2)} m².`:'Using the enclosed room footprint.'} Drawn ceilings may extend over wall thickness or cover only part of a room.</div>`;
  }
  $('#surfaceEnabled').onchange=e=>{pushHistory();s.enabled=e.target.checked;persist();renderProperties();draw();};
  $('#surfaceMaterial').onchange=e=>{pushHistory();s.materialId=e.target.value;s.colour=materialById(e.target.value)?.swatch||s.colour;persist();draw();};
  if(type==='floor'){
    const num=(id,key,min=0)=>$(id).onchange=e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<min)return;pushHistory();s[key]=v;persist();renderProperties();draw();};num('#tileW','tileWidth',10);num('#tileH','tileHeight',10);num('#surfaceGrout','grout',0);$('#surfaceRotation').onchange=e=>{pushHistory();s.rotation=Number(e.target.value)||0;persist();draw();};$('#surfaceWaste').onchange=e=>{pushHistory();s.waste=Math.max(0,Number(e.target.value)||0);persist();renderProperties();draw();};
  }else{
    $('#ceilingThickness').onchange=e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<1)return;pushHistory();s.thickness=v;persist();draw();};$('#ceilingVisible').onchange=e=>{pushHistory();s.visible3d=e.target.checked;persist();draw();};
    $('#redrawCeilingBtn').onclick=()=>setTool('ceiling');
    $('#autoCeilingBtn').onclick=()=>{pushHistory();delete s.polygon;s.enabled=true;persist();ceilingDraft=[];renderer.tempCeiling=null;renderProperties();draw();message('Ceiling now follows the enclosed room footprint.');};
  }
}

function renderLightProperties(light){
  const panel=$('#propertiesPanel');$('#propertyContext').textContent='Lighting';panel.innerHTML=`<div class="prop-card"><h4>${light.name}</h4><div class="prop-row"><span>Enabled</span><input type="checkbox" id="lightEnabled" ${light.enabled?'checked':''}></div><div class="prop-row"><span>X</span><input class="prop-input" id="lightX" value="${Math.round(light.x)}"></div><div class="prop-row"><span>Y</span><input class="prop-input" id="lightY" value="${Math.round(light.y)}"></div><div class="prop-row"><span>Drop</span><input class="prop-input" id="lightDrop" value="${light.drop}"></div><div class="prop-row"><span>Size</span><input class="prop-input" id="lightDiameter" value="${light.diameter}"></div><div class="prop-row"><span>Lumens</span><input class="prop-input" id="lightLumens" value="${light.lumens}"></div><div class="prop-row"><span>Kelvin</span><input class="prop-input" id="lightKelvin" value="${light.kelvin}"></div><button class="btn ghost full" id="deleteLightBtn" style="margin-top:10px;color:#8c4b3e">Delete light</button></div>`;
  $('#lightEnabled').onchange=e=>{pushHistory();light.enabled=e.target.checked;persist();draw();};const edit=(id,key,min=-Infinity)=>$(id).onchange=e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<min)return;pushHistory();light[key]=v;persist();draw();};edit('#lightX','x');edit('#lightY','y');edit('#lightDrop','drop',0);edit('#lightDiameter','diameter',10);$('#lightLumens').onchange=e=>{pushHistory();light.lumens=Math.max(0,Number(e.target.value)||0);persist();draw();};$('#lightKelvin').onchange=e=>{pushHistory();light.kelvin=Math.max(1000,Number(e.target.value)||3000);persist();draw();};$('#deleteLightBtn').onclick=()=>{pushHistory();project.room.lighting=project.room.lighting.filter(l=>l.id!==light.id);selectedId=null;persist();renderProperties();draw();};
}

function renderCatalog(){const active=$('.catalog-tab.active')?.dataset.cat||'cabinets',q=$('#catalogSearch').value.trim().toLowerCase(),items=(CATALOG[active]||[]).filter(i=>`${i.name} ${i.meta}`.toLowerCase().includes(q));$('#catalogList').innerHTML=items.map(i=>`<div class="catalog-card" data-cat="${active}" data-id="${i.id}"><div class="swatch" style="background:${i.swatch}"></div><b>${i.name}</b><small>${i.meta}</small></div>`).join('');$$('#catalogList .catalog-card').forEach(card=>card.onclick=()=>handleCatalogItem(card.dataset.cat,card.dataset.id));}
function handleCatalogItem(cat,id){if(cat==='lighting'){pendingLightType=id;setTool('light');message(`${CATALOG.lighting.find(x=>x.id===id)?.name||'Light'} selected. Click the 2D plan to place it.`);return;}if(cat==='materials'&&surfaceType()){const s=project.room.surfaces[surfaceType()],m=materialById(id);pushHistory();s.materialId=id;s.colour=m?.swatch||s.colour;persist();renderProperties();draw();}}
function pointerPos(ev){const r=canvas.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};}
function finishCeiling(){const pts=[];for(const p of ceilingDraft){const last=pts.at(-1);if(!last||Math.hypot(p.x-last.x,p.y-last.y)>1)pts.push(p);}if(pts.length>=3&&Math.hypot(pts[0].x-pts.at(-1).x,pts[0].y-pts.at(-1).y)<2)pts.pop();if(pts.length<3){message('Ceiling needs at least 3 points.');return;}pushHistory();const s=project.room.surfaces.ceiling;s.polygon=pts.map(p=>({x:p.x,y:p.y}));s.enabled=true;s.visible3d=true;persist();ceilingDraft=[];renderer.tempCeiling=null;setTool('select');selectedId='surface:ceiling';renderer.selectedId=selectedId;renderProperties();draw();message('Custom ceiling created.');}

canvas.addEventListener('pointerdown',ev=>{
  const s=pointerPos(ev);pointerDown=s;canvas.setPointerCapture?.(ev.pointerId);if(activeView!=='plan'){panStart={x:s.x,y:s.y,yaw:renderer.camera.yaw,pitch:renderer.camera.pitch};return;}const world=renderer.screenToWorld(s);
  if(calibrationMode){renderer.calibrationPoints.push(world);if(renderer.calibrationPoints.length===2){draw();setTimeout(finishCalibration,0);}else message('Calibration: choose the second point.');draw();return;}
  if(activeTool==='ceiling'){
    const p=snapPoint(world,project,80);if(ceilingDraft.length>=3&&Math.hypot(p.x-ceilingDraft[0].x,p.y-ceilingDraft[0].y)<=Math.max(80,project.settings.snap||50)){finishCeiling();return;}ceilingDraft.push(p);renderer.tempCeiling=[...ceilingDraft];draw();message(`Ceiling point ${ceilingDraft.length} added.`);return;
  }
  if(activeTool==='light'&&pendingLightType){pushHistory();const light=addLight(project,pendingLightType,snapPoint(world,project,40));selectedId=light.id;renderer.selectedId=selectedId;persist();renderProperties();draw();return;}
  if(activeTool==='wall'){const p=snapPoint(world,project);if(!wallStart){wallStart=p;renderer.tempWall={start:p,end:p};}else if(Math.hypot(p.x-wallStart.x,p.y-wallStart.y)>=50){pushHistory();const w=addWall(project,wallStart,p,{connectionMode:'connected'});selectedId=w.id;renderer.selectedId=selectedId;persist();wallStart={...w.end};renderer.tempWall={start:wallStart,end:wallStart};renderProperties();}draw();return;}
  const lh=renderer.hitLight(project,s,14);if(lh){selectedId=lh.id;renderer.selectedId=selectedId;renderProperties();draw();return;}const hit=renderer.hitWall(project,s,14);selectedId=hit?.id||null;renderer.selectedId=selectedId;renderProperties();draw();if(!hit)panStart={x:s.x,y:s.y,cx:renderer.camera.cx,cy:renderer.camera.cy};
});
canvas.addEventListener('pointermove',ev=>{const s=pointerPos(ev);if(activeView==='plan'){const w=renderer.screenToWorld(s);$('#cursorReadout').textContent=`X ${Math.round(w.x)} mm · Y ${Math.round(w.y)} mm`;if(activeTool==='wall'&&wallStart){renderer.tempWall={start:wallStart,end:snapPoint(w,project)};draw();}if(activeTool==='ceiling'&&ceilingDraft.length){renderer.tempCeiling=[...ceilingDraft,snapPoint(w,project,80)];draw();}if(pointerDown&&panStart&&activeTool==='select'&&!selectedId){const dx=s.x-panStart.x,dy=s.y-panStart.y;renderer.camera.cx=panStart.cx-dx/renderer.camera.zoom;renderer.camera.cy=panStart.cy-dy/renderer.camera.zoom;draw();}}else if(pointerDown&&panStart){const dx=s.x-panStart.x,dy=s.y-panStart.y;renderer.camera.yaw=panStart.yaw+dx*.006;renderer.camera.pitch=Math.max(.15,Math.min(1.25,panStart.pitch+dy*.004));draw();}});
canvas.addEventListener('pointerup',()=>{pointerDown=null;panStart=null;});
canvas.addEventListener('dblclick',()=>{if(activeTool==='wall'){wallStart=null;renderer.tempWall=null;message('Wall chain finished.');draw();}else if(activeTool==='ceiling')finishCeiling();});
canvas.addEventListener('wheel',ev=>{ev.preventDefault();if(activeView==='plan'){const before=renderer.screenToWorld(pointerPos(ev)),factor=ev.deltaY<0?1.12:.89;renderer.camera.zoom=Math.max(.02,Math.min(2,renderer.camera.zoom*factor));const after=renderer.screenToWorld(pointerPos(ev));renderer.camera.cx+=before.x-after.x;renderer.camera.cy+=before.y-after.y;draw();}},{passive:false});
window.addEventListener('keydown',ev=>{if(ev.key==='Escape'){ceilingDraft=[];renderer.tempCeiling=null;wallStart=null;renderer.tempWall=null;calibrationMode=false;renderer.calibrationPoints=[];setTool('select');}if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){ev.preventDefault();undo();}});

$('#selectTool').onclick=()=>setTool('select');$('#wallTool').onclick=()=>setTool('wall');$('#floorSurfaceBtn').onclick=()=>{selectedId='surface:floor';renderer.selectedId=selectedId;setTool('select');renderProperties();draw();};$('#ceilingSurfaceBtn').onclick=()=>setTool('ceiling');$$('.view-btn').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('#undoBtn').onclick=undo;
$('#newProjectBtn').onclick=()=>{if(!confirm('Create a new blank project?'))return;pushHistory();project=newProject();selectedId=null;floorImage=null;renderer.setFloorImage(null);persist();syncUI();setView('plan');};$('#saveProjectBtn').onclick=()=>{persist();message('Project saved locally');};$('#projectNameInput').oninput=e=>{project.name=e.target.value;persist();};$('#ceilingHeightInput').onchange=e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<1800)return;pushHistory();project.settings.ceilingHeight=v;project.room.lighting.forEach(l=>l.ceilingHeight=v);persist();renderProperties();draw();};$('#wallThicknessInput').onchange=e=>{const v=parseLength(e.target.value);if(Number.isFinite(v)&&v>=20){project.settings.defaultWallThickness=v;persist();}};$('#unitSelect').onchange=e=>{project.settings.primaryUnit=e.target.value;persist();renderProperties();draw();};$('#secondaryInchesToggle').onchange=e=>{project.settings.secondaryInches=e.target.checked;persist();renderProperties();draw();};$('#planOpacityInput').oninput=e=>{if(project.floorPlan){project.floorPlan.opacity=Number(e.target.value)/100;persist();draw();}};
$('#floorPlanInput').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')){alert('PNG/JPG/WebP only for now.');return;}const data=await fileToDataURL(file),img=new Image();img.onload=()=>{floorImage=img;renderer.setFloorImage(img);pushHistory();project.floorPlan={name:file.name,dataUrl:data,mmPerPixel:5,x:0,y:0,opacity:.45,widthPx:img.naturalWidth,heightPx:img.naturalHeight};persist();renderer.fit(project);syncUI();setView('plan');draw();};img.src=data;};
$('#calibrateBtn').onclick=()=>{if(!project.floorPlan||!floorImage){alert('Upload a floor plan first.');return;}setTool('select');calibrationMode=true;renderer.calibrationPoints=[];message('Calibration: click two points.');};
function finishCalibration(){const pts=renderer.calibrationPoints;if(pts.length!==2)return;const shown=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y),input=prompt('Enter real distance:','1000 mm'),real=parseLength(input);if(Number.isFinite(real)&&real>0&&shown>0){pushHistory();const ratio=real/shown;project.floorPlan.mmPerPixel*=ratio;persist();}calibrationMode=false;renderer.calibrationPoints=[];draw();}
$('#removePlanBtn').onclick=()=>{if(!project.floorPlan)return;pushHistory();project.floorPlan=null;floorImage=null;renderer.setFloorImage(null);persist();draw();};$('#clearPlanBtn').onclick=()=>{if(!project.room.walls.length||!confirm('Remove all room walls?'))return;pushHistory();project.room.walls=[];selectedId=null;persist();renderProperties();draw();};$('#exportProjectBtn').onclick=()=>downloadBlob(`${safeName(project.name)}.kitchen.json`,JSON.stringify(project,null,2),'application/json');
$('#importProjectInput').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{project=normalizeProject(JSON.parse(await file.text()));selectedId=null;if(project.floorPlan?.dataUrl){const img=new Image();img.onload=()=>{floorImage=img;renderer.setFloorImage(img);renderer.fit(project);draw();};img.src=project.floorPlan.dataUrl;}persist();syncUI();renderer.fit(project);draw();}catch(err){alert(err.message||'Could not import project.');}};
$('#exportImageBtn').onclick=()=>{draw();canvas.toBlob(blob=>{if(!blob)return;const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=`${safeName(project.name)}-${activeView}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);},'image/png',1);};$$('.catalog-tab').forEach(b=>b.onclick=()=>{$$('.catalog-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderCatalog();});$('#catalogSearch').oninput=renderCatalog;
function fileToDataURL(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});}function safeName(s){return String(s||'project').trim().replace(/[^\w\-]+/g,'-').replace(/^-+|-+$/g,'')||'project';}function downloadBlob(name,text,type){const blob=new Blob([text],{type}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}async function restoreFloorImage(){if(!project.floorPlan?.dataUrl)return;const img=new Image();await new Promise(res=>{img.onload=res;img.onerror=res;img.src=project.floorPlan.dataUrl;});if(img.naturalWidth){floorImage=img;renderer.setFloorImage(img);}}
window.addEventListener('resize',sizeCanvas);await restoreFloorImage();syncUI();requestAnimationFrame(()=>{sizeCanvas();if(project.room.walls.length)renderer.fit(project);draw();});
