import {
  STORAGE_KEY,CATALOG,newProject,normalizeProject,clone,addWall,wallLength,setWallLength,
  setWallConnection,setWallEndpoint,snapPoint,parseLength,
  roomPolygon,polygonArea,addLight,materialById
} from './model.mjs';
import {StudioRenderer} from './render.mjs';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const canvas=$('#workspaceCanvas'),renderer=new StudioRenderer(canvas);
let project=loadProject(),selectedId=null,selectedWallIds=new Set(),activeTool='select',activeView='plan',wallStart=null,pointerDown=null,panStart=null,history=[],floorImage=null,pendingLightType=null,ceilingDraft=[];

window.__ksMultiSelection={category:null,ids:[]};

function loadProject(){try{const raw=localStorage.getItem(STORAGE_KEY);return raw?normalizeProject(JSON.parse(raw)):newProject();}catch{return newProject();}}
function persist(){project.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(project));}
function pushHistory(){history.push(clone(project));if(history.length>50)history.shift();}
function clearWallSelection(){selectedWallIds.clear();window.__ksMultiSelection={category:null,ids:[]};}
function syncWallSelectionGlobal(){window.__ksMultiSelection={category:'walls',ids:[...selectedWallIds]};}
function undo(){const prev=history.pop();if(!prev)return;project=prev;selectedId=null;clearWallSelection();renderer.selectedId=null;renderer.tempCeiling=null;ceilingDraft=[];syncUI();persist();draw();message('Undo');}
function message(t){const el=$('#statusMessage');if(el)el.textContent=t;}
function sizeCanvas(){const r=canvas.parentElement.getBoundingClientRect();renderer.resize(r.width,r.height,window.devicePixelRatio||1);draw();}
function draw(){renderer.selectedId=selectedId;renderer.setView(activeView);renderer.draw(project);const stats=$('#projectStats');if(stats)stats.textContent=`${project.room.walls.length} walls · ${project.room.lighting.length} lights · ${project.kitchen.objects.length} objects`;}
function setViewButtons(){$$('.view-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===activeView));}

function setTool(tool){
  activeTool=tool;wallStart=null;renderer.tempWall=null;
  if(tool!=='light')pendingLightType=null;
  if(tool!=='ceiling'){ceilingDraft=[];renderer.tempCeiling=null;}
  $$('.tool-card[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  if(tool==='wall'){
    activeView='plan';setViewButtons();message('Wall tool: click start point, then end point.');$('#stageHint').textContent='Walls connect automatically when endpoints snap together. Double-click to finish the chain.';
  }else if(tool==='light'){
    activeView='plan';setViewButtons();message('Lighting placement: click the plan to place the selected fixture.');$('#stageHint').textContent='Click anywhere in the room to place the selected light.';
  }else if(tool==='ceiling'){
    activeView='plan';setViewButtons();clearWallSelection();selectedId='surface:ceiling';renderer.selectedId=selectedId;message('Ceiling tool: click points around the ceiling area. Click the first point again or double-click to finish.');$('#stageHint').textContent='Draw the ceiling as its own polygon. It can extend over wall thickness or cover only part of the room.';
  }else{
    message('Select mode');$('#stageHint').textContent=project.room.walls.length?'Select a wall, light, floor, ceiling or cabinet to edit it.':'Draw a wall or upload a floor plan to begin.';
  }
  renderProperties();draw();
}
function setView(view){activeView=view;renderer.setView(view);setViewButtons();$('#viewBadge').textContent=view==='plan'?'2D PLAN':view==='3d'?'INTERACTIVE 3D':'RENDER PREVIEW';$('#stageHint').textContent=view==='render'?'Render preview uses live room surfaces, lighting and project geometry.':view==='3d'?'3D is generated directly from the editable project geometry.':'Draw, measure and edit the room in millimetres.';draw();}
function syncUI(){$('#projectNameInput').value=project.name;$('#ceilingHeightInput').value=project.settings.ceilingHeight;$('#wallThicknessInput').value=project.settings.defaultWallThickness;$('#unitSelect').value=project.settings.primaryUnit;$('#secondaryInchesToggle').checked=!!project.settings.secondaryInches;$('#planOpacityInput').value=Math.round((project.floorPlan?.opacity??.45)*100);renderProperties();renderCatalog();}
function selectedWall(){return project.room.walls.find(w=>w.id===selectedId)||null;}
function selectedWalls(){return project.room.walls.filter(w=>selectedWallIds.has(w.id));}
function selectedLight(){return project.room.lighting.find(l=>l.id===selectedId)||null;}
function surfaceType(){return selectedId==='surface:floor'?'floor':selectedId==='surface:ceiling'?'ceiling':null;}
function materialOptions(sel){return CATALOG.materials.map(m=>`<option value="${m.id}" ${m.id===sel?'selected':''}>${m.name}</option>`).join('');}
function ceilingPoly(){const p=project.room.surfaces.ceiling.polygon;return Array.isArray(p)&&p.length>=3?p:roomPolygon(project);}
function commonValue(items,key,formatter=v=>v){if(!items.length)return'';const first=formatter(items[0][key]);return items.every(x=>formatter(x[key])===first)?first:'';}

function renderProperties(){
  const panel=$('#propertiesPanel'),walls=selectedWalls(),wall=selectedWall(),light=selectedLight(),surface=surfaceType();
  if(walls.length>1){renderMultiWallProperties(walls);return;}
  if(surface){renderSurfaceProperties(surface);return;}
  if(light){renderLightProperties(light);return;}
  if(!wall){panel.innerHTML='';$('#propertyContext').textContent='Project';return;}
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
  $('#deleteWallBtn').onclick=()=>deleteSelectedWalls();
}

function renderMultiWallProperties(walls){
  const panel=$('#propertiesPanel');$('#propertyContext').textContent=`${walls.length} Walls`;
  const length=walls.every(w=>Math.round(wallLength(w))===Math.round(wallLength(walls[0])))?Math.round(wallLength(walls[0])):'';
  const thickness=commonValue(walls,'thickness'),height=commonValue(walls,'height');
  const mode=walls.every(w=>w.connectionMode===walls[0].connectionMode)?walls[0].connectionMode:'';
  panel.innerHTML=`<div class="prop-card"><h4>${walls.length} walls selected</h4>
    <div class="render-note" style="margin:0 0 10px">Shift-click walls to add/remove them from this selection. Changes below apply to every selected wall.</div>
    <div class="prop-row"><span>Length · set all</span><input class="prop-input" id="multiWallLength" placeholder="mixed" value="${length}"></div>
    <div class="prop-row"><span>Thickness</span><input class="prop-input" id="multiWallThickness" placeholder="mixed" value="${thickness}"></div>
    <div class="prop-row"><span>Height</span><input class="prop-input" id="multiWallHeight" placeholder="mixed" value="${height}"></div>
    <div class="prop-row"><span>Joints</span><select class="prop-input" id="multiWallMode"><option value="" ${mode===''?'selected':''}>Mixed / unchanged</option><option value="connected" ${mode==='connected'?'selected':''}>Connected</option><option value="independent" ${mode==='independent'?'selected':''}>Independent</option></select></div>
    <button class="btn ghost full" id="deleteMultiWalls" style="margin-top:10px;color:#8c4b3e">Delete selected walls</button></div>`;
  const applyNumeric=(id,min,fn)=>$(id).onchange=e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<min)return;pushHistory();let changed=0;for(const w of selectedWalls()){if(w.locked)continue;if(fn(w,v)!==false)changed++;}persist();renderProperties();draw();message(`${changed} selected walls updated.`);};
  applyNumeric('#multiWallLength',50,(w,v)=>setWallLength(project,w,v));
  applyNumeric('#multiWallThickness',20,(w,v)=>{w.thickness=v;return true;});
  applyNumeric('#multiWallHeight',200,(w,v)=>{w.height=v;return true;});
  $('#multiWallMode').onchange=e=>{if(!e.target.value)return;pushHistory();for(const w of selectedWalls()){if(!w.locked)setWallConnection(project,w,e.target.value);}persist();renderProperties();draw();message('Selected wall joint mode updated.');};
  $('#deleteMultiWalls').onclick=()=>deleteSelectedWalls();
}

function deleteSelectedWalls(){
  const ids=selectedWallIds.size?new Set(selectedWallIds):(selectedWall()?new Set([selectedWall().id]):new Set());
  if(!ids.size)return;
  const deletable=project.room.walls.filter(w=>ids.has(w.id)&&!w.locked);
  if(!deletable.length){message('Selected wall(s) are locked.');return;}
  pushHistory();project.room.walls=project.room.walls.filter(w=>!ids.has(w.id)||w.locked);selectedId=null;clearWallSelection();persist();renderProperties();draw();message(`${deletable.length} wall${deletable.length===1?'':'s'} deleted.`);
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
  $('#lightEnabled').onchange=e=>{pushHistory();light.enabled=e.target.checked;persist();draw();};const edit=(id,key,min=-Infinity)=>$(id).onchange=e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<min)return;pushHistory();light[key]=v;persist();draw();};edit('#lightX','x');edit('#lightY','y');edit('#lightDrop','drop',0);edit('#lightDiameter','diameter',10);$('#lightLumens').onchange=e=>{pushHistory();light.lumens=Math.max(0,Number(e.target.value)||0);persist();draw();};$('#lightKelvin').onchange=e=>{pushHistory();light.kelvin=Math.max(1000,Number(e.target.value)||3000);persist();draw();};$('#deleteLightBtn').onclick=()=>deleteSelectedLight();
}
function deleteSelectedLight(){const light=selectedLight();if(!light)return;pushHistory();project.room.lighting=project.room.lighting.filter(l=>l.id!==light.id);selectedId=null;persist();renderProperties();draw();message('Light deleted.');}

function renderCatalog(){const active=$('.catalog-tab[data-cat].active')?.dataset.cat||'cabinets',q=$('#catalogSearch').value.trim().toLowerCase(),items=(CATALOG[active]||[]).filter(i=>`${i.name} ${i.meta}`.toLowerCase().includes(q));$('#catalogList').innerHTML=items.map(i=>`<div class="catalog-card" data-cat="${active}" data-id="${i.id}"><div class="swatch" style="background:${i.swatch}"></div><b>${i.name}</b><small>${i.meta}</small></div>`).join('');$$('#catalogList .catalog-card').forEach(card=>card.onclick=()=>handleCatalogItem(card.dataset.cat,card.dataset.id));}
function handleCatalogItem(cat,id){if(cat==='lighting'){pendingLightType=id;setTool('light');message(`${CATALOG.lighting.find(x=>x.id===id)?.name||'Light'} selected. Click the 2D plan to place it.`);return;}if(cat==='materials'&&surfaceType()){const s=project.room.surfaces[surfaceType()],m=materialById(id);pushHistory();s.materialId=id;s.colour=m?.swatch||s.colour;persist();renderProperties();draw();}}
function pointerPos(ev){const r=canvas.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};}
function finishCeiling(){const pts=[];for(const p of ceilingDraft){const last=pts.at(-1);if(!last||Math.hypot(p.x-last.x,p.y-last.y)>1)pts.push(p);}if(pts.length>=3&&Math.hypot(pts[0].x-pts.at(-1).x,pts[0].y-pts.at(-1).y)<2)pts.pop();if(pts.length<3){message('Ceiling needs at least 3 points.');return;}pushHistory();const s=project.room.surfaces.ceiling;s.polygon=pts.map(p=>({x:p.x,y:p.y}));s.enabled=true;s.visible3d=true;persist();ceilingDraft=[];renderer.tempCeiling=null;setTool('select');clearWallSelection();selectedId='surface:ceiling';renderer.selectedId=selectedId;renderProperties();draw();message('Custom ceiling created.');}

canvas.addEventListener('pointerdown',ev=>{
  const s=pointerPos(ev);pointerDown=s;canvas.setPointerCapture?.(ev.pointerId);if(activeView!=='plan'){panStart={x:s.x,y:s.y,yaw:renderer.camera.yaw,pitch:renderer.camera.pitch};return;}const world=renderer.screenToWorld(s);
  if(activeTool==='ceiling'){
    const p=snapPoint(world,project,80);if(ceilingDraft.length>=3&&Math.hypot(p.x-ceilingDraft[0].x,p.y-ceilingDraft[0].y)<=Math.max(80,project.settings.snap||50)){finishCeiling();return;}ceilingDraft.push(p);renderer.tempCeiling=[...ceilingDraft];draw();message(`Ceiling point ${ceilingDraft.length} added.`);return;
  }
  if(activeTool==='light'&&pendingLightType){pushHistory();const light=addLight(project,pendingLightType,snapPoint(world,project,40));clearWallSelection();selectedId=light.id;renderer.selectedId=selectedId;persist();renderProperties();draw();return;}
  if(activeTool==='wall'){const p=snapPoint(world,project);if(!wallStart){wallStart=p;renderer.tempWall={start:p,end:p};}else if(Math.hypot(p.x-wallStart.x,p.y-wallStart.y)>=50){pushHistory();const w=addWall(project,wallStart,p,{connectionMode:'connected'});clearWallSelection();selectedWallIds.add(w.id);syncWallSelectionGlobal();selectedId=w.id;renderer.selectedId=selectedId;persist();wallStart={...w.end};renderer.tempWall={start:wallStart,end:wallStart};renderProperties();}draw();return;}
  const lh=renderer.hitLight(project,s,14);if(lh){clearWallSelection();selectedId=lh.id;renderer.selectedId=selectedId;renderProperties();draw();return;}
  const hit=renderer.hitWall(project,s,14);
  if(hit){
    if(ev.shiftKey){if(selectedWallIds.has(hit.id))selectedWallIds.delete(hit.id);else selectedWallIds.add(hit.id);if(!selectedWallIds.size){selectedId=null;}else selectedId=hit.id;syncWallSelectionGlobal();renderer.selectedId=selectedId;renderProperties();draw();message(`${selectedWallIds.size} wall${selectedWallIds.size===1?'':'s'} selected.`);return;}
    clearWallSelection();selectedWallIds.add(hit.id);syncWallSelectionGlobal();selectedId=hit.id;renderer.selectedId=selectedId;renderProperties();draw();return;
  }
  if(!ev.shiftKey){clearWallSelection();selectedId=null;renderer.selectedId=null;renderProperties();draw();panStart={x:s.x,y:s.y,cx:renderer.camera.cx,cy:renderer.camera.cy};}
});
canvas.addEventListener('pointermove',ev=>{const s=pointerPos(ev);if(activeView==='plan'){const w=renderer.screenToWorld(s);$('#cursorReadout').textContent=`X ${Math.round(w.x)} mm · Y ${Math.round(w.y)} mm`;if(activeTool==='wall'&&wallStart){renderer.tempWall={start:wallStart,end:snapPoint(w,project)};draw();}if(activeTool==='ceiling'&&ceilingDraft.length){renderer.tempCeiling=[...ceilingDraft,snapPoint(w,project,80)];draw();}if(pointerDown&&panStart&&activeTool==='select'&&!selectedId){const dx=s.x-panStart.x,dy=s.y-panStart.y;renderer.camera.cx=panStart.cx-dx/renderer.camera.zoom;renderer.camera.cy=panStart.cy-dy/renderer.camera.zoom;draw();}}else if(pointerDown&&panStart){const dx=s.x-panStart.x,dy=s.y-panStart.y;renderer.camera.yaw=panStart.yaw+dx*.006;renderer.camera.pitch=Math.max(.15,Math.min(1.25,panStart.pitch+dy*.004));draw();}});
canvas.addEventListener('pointerup',()=>{pointerDown=null;panStart=null;});
canvas.addEventListener('dblclick',()=>{if(activeTool==='wall'){wallStart=null;renderer.tempWall=null;message('Wall chain finished.');draw();}else if(activeTool==='ceiling')finishCeiling();});
canvas.addEventListener('wheel',ev=>{ev.preventDefault();if(activeView==='plan'){const before=renderer.screenToWorld(pointerPos(ev)),factor=ev.deltaY<0?1.12:.89;renderer.camera.zoom=Math.max(.02,Math.min(2,renderer.camera.zoom*factor));const after=renderer.screenToWorld(pointerPos(ev));renderer.camera.cx+=before.x-after.x;renderer.camera.cy+=before.y-after.y;draw();}},{passive:false});

window.addEventListener('keydown',ev=>{
  const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
  if(ev.key==='Escape'){ceilingDraft=[];renderer.tempCeiling=null;wallStart=null;renderer.tempWall=null;setTool('select');}
  if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){ev.preventDefault();undo();return;}
  if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='a'&&!typing){
    const wallContext=selectedWallIds.size>0||!!selectedWall()||$('#propertyContext')?.textContent?.toLowerCase().includes('wall');
    if(wallContext&&project.room.walls.length){ev.preventDefault();selectedWallIds=new Set(project.room.walls.map(w=>w.id));selectedId=project.room.walls[0]?.id||null;syncWallSelectionGlobal();renderProperties();draw();message(`${selectedWallIds.size} walls selected.`);return;}
  }
  if((ev.key==='Delete'||ev.key==='Backspace')&&!typing){
    if(selectedWallIds.size||selectedWall()){ev.preventDefault();deleteSelectedWalls();return;}
    if(selectedLight()){ev.preventDefault();deleteSelectedLight();return;}
  }
});

$('#selectTool').onclick=()=>setTool('select');$('#wallTool').onclick=()=>setTool('wall');$('#floorSurfaceBtn').onclick=()=>{clearWallSelection();selectedId='surface:floor';renderer.selectedId=selectedId;setTool('select');renderProperties();draw();};$('#ceilingSurfaceBtn').onclick=()=>setTool('ceiling');$$('.view-btn').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('#undoBtn').onclick=undo;
$('#newProjectBtn').onclick=()=>{if(!confirm('Create a new blank project?'))return;pushHistory();project=newProject();selectedId=null;clearWallSelection();floorImage=null;renderer.setFloorImage(null);persist();syncUI();setView('plan');};$('#saveProjectBtn').onclick=()=>{persist();message('Project saved locally');};$('#projectNameInput').oninput=e=>{project.name=e.target.value;persist();};$('#ceilingHeightInput').onchange=e=>{const v=parseLength(e.target.value);if(!Number.isFinite(v)||v<1800)return;pushHistory();project.settings.ceilingHeight=v;project.room.lighting.forEach(l=>l.ceilingHeight=v);persist();renderProperties();draw();};$('#wallThicknessInput').onchange=e=>{const v=parseLength(e.target.value);if(Number.isFinite(v)&&v>=20){project.settings.defaultWallThickness=v;persist();}};$('#unitSelect').onchange=e=>{project.settings.primaryUnit=e.target.value;persist();renderProperties();draw();};$('#secondaryInchesToggle').onchange=e=>{project.settings.secondaryInches=e.target.checked;persist();renderProperties();draw();};$('#planOpacityInput').oninput=e=>{if(project.floorPlan){project.floorPlan.opacity=Number(e.target.value)/100;persist();draw();}};
$('#floorPlanInput').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')){alert('PNG/JPG/WebP only for now.');return;}const data=await fileToDataURL(file),img=new Image();img.onload=()=>{floorImage=img;renderer.setFloorImage(img);pushHistory();project.floorPlan={name:file.name,dataUrl:data,mmPerPixel:5,x:0,y:0,opacity:.45,widthPx:img.naturalWidth,heightPx:img.naturalHeight};persist();renderer.fit(project);syncUI();setView('plan');draw();message('Floor plan uploaded as a reference. Automatic AI reconstruction is temporarily disabled until the plan reader is reliable.');};img.src=data;};
$('#removePlanBtn').onclick=()=>{if(!project.floorPlan)return;pushHistory();project.floorPlan=null;floorImage=null;renderer.setFloorImage(null);persist();draw();};$('#clearPlanBtn').onclick=()=>{if(!project.room.walls.length||!confirm('Remove all room walls?'))return;pushHistory();project.room.walls=[];selectedId=null;clearWallSelection();persist();renderProperties();draw();};$('#exportProjectBtn').onclick=()=>downloadBlob(`${safeName(project.name)}.kitchen.json`,JSON.stringify(project,null,2),'application/json');
$('#importProjectInput').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{project=normalizeProject(JSON.parse(await file.text()));selectedId=null;clearWallSelection();if(project.floorPlan?.dataUrl){const img=new Image();img.onload=()=>{floorImage=img;renderer.setFloorImage(img);renderer.fit(project);draw();};img.src=project.floorPlan.dataUrl;}persist();syncUI();renderer.fit(project);draw();}catch(err){alert(err.message||'Could not import project.');}};
$('#exportImageBtn').onclick=()=>{draw();canvas.toBlob(blob=>{if(!blob)return;const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=`${safeName(project.name)}-${activeView}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);},'image/png',1);};$$('.catalog-tab[data-cat]').forEach(b=>b.onclick=()=>{$$('.catalog-tab[data-cat]').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderCatalog();});$('#catalogSearch').oninput=renderCatalog;
function fileToDataURL(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});}function safeName(s){return String(s||'project').trim().replace(/[^\w\-]+/g,'-').replace(/^-+|-+$/g,'')||'project';}function downloadBlob(name,text,type){const blob=new Blob([text],{type}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}async function restoreFloorImage(){if(!project.floorPlan?.dataUrl)return;const img=new Image();await new Promise(res=>{img.onload=res;img.onerror=res;img.src=project.floorPlan.dataUrl;});if(img.naturalWidth){floorImage=img;renderer.setFloorImage(img);}}
window.addEventListener('resize',sizeCanvas);await restoreFloorImage();syncUI();requestAnimationFrame(()=>{sizeCanvas();if(project.room.walls.length)renderer.fit(project);draw();});
