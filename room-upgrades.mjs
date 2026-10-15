const STORAGE_KEY='kitchen-studio-project-v2';
const $=s=>document.querySelector(s);

function readProject(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch{return null;}}
function writeProject(p){p.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(p));}
function uid(prefix){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;}
function status(text){const el=$('#statusMessage');if(el)el.textContent=text;}

function roomAreaFromWalls(p){
  const walls=(p?.room?.walls||[]).filter(w=>w.connectionMode==='connected');
  if(walls.length<3)return 0;
  const byJoint=new Map();
  for(const w of walls){
    for(const key of ['start','end']){
      const id=w[`${key}JointId`];
      if(!id)continue;
      if(!byJoint.has(id))byJoint.set(id,[]);
      byJoint.get(id).push({wall:w,key});
    }
  }
  const usable=walls.filter(w=>byJoint.get(w.startJointId)?.length===2&&byJoint.get(w.endJointId)?.length===2);
  if(usable.length<3)return 0;
  const first=usable[0],pts=[{...first.start},{...first.end}];
  let current=first,joint=first.endJointId,guard=0;
  while(joint!==first.startJointId&&guard++<usable.length+2){
    const links=(byJoint.get(joint)||[]).filter(e=>e.wall.id!==current.id);
    if(links.length!==1)return 0;
    const next=links[0].wall,key=links[0].key,other=key==='start'?'end':'start';
    current=next;joint=next[`${other}JointId`];pts.push({...next[other]});
  }
  if(joint!==first.startJointId)return 0;
  pts.pop();
  let sum=0;for(let i=0,j=pts.length-1;i<pts.length;j=i++)sum+=pts[j].x*pts[i].y-pts[i].x*pts[j].y;
  return Math.abs(sum)/2;
}

function dimensionGuessFromWalls(p){
  const walls=p?.room?.walls||[];
  if(!walls.length)return{width:0,length:0};
  const xs=[],ys=[];
  for(const w of walls){xs.push(w.start.x,w.end.x);ys.push(w.start.y,w.end.y);}
  return{width:Math.max(...xs)-Math.min(...xs),length:Math.max(...ys)-Math.min(...ys)};
}

function buildRectangle(width,length,source='manual'){
  const p=readProject();if(!p)return false;
  width=Math.round(Number(width));length=Math.round(Number(length));
  if(width<300||length<300)return false;
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
  p.kitchen=p.kitchen||{objects:[],runs:[]};
  p.kitchen.objects=[];p.kitchen.runs=[];
  p.roomTemplate={type:'rectangle',width,length,source};
  writeProject(p);return true;
}

function installRectangleTool(){
  const wallTool=$('#wallTool');if(!wallTool||$('#rectangleRoomTool'))return;
  const b=document.createElement('button');b.className='tool-card';b.id='rectangleRoomTool';
  b.innerHTML='<span class="tool-icon">□</span><span><b>Square / rectangle room</b><small>Enter dimensions + see room area</small></span>';
  wallTool.insertAdjacentElement('afterend',b);
  b.onclick=showRectangleProperties;
}

function showRectangleProperties(){
  const panel=$('#propertiesPanel');if(!panel)return;
  const p=readProject(),tpl=p?.roomTemplate||{},bounds=dimensionGuessFromWalls(p);
  const width=Math.round(tpl.width||bounds.width||3000),length=Math.round(tpl.length||bounds.length||3000);
  $('#propertyContext').textContent='Room';
  panel.innerHTML=`<div class="prop-card"><h4>Square / rectangle room</h4>
    <div class="prop-row"><span>Width</span><input class="prop-input" id="roomRectWidth" value="${width}"></div>
    <div class="prop-row"><span>Length</span><input class="prop-input" id="roomRectLength" value="${length}"></div>
    <div class="prop-row"><span>Area</span><b id="roomRectArea">${((width*length)/1e6).toFixed(2)} m²</b></div>
    <button class="btn primary full" id="applyRectRoom" style="margin-top:10px">Create / replace room</button></div>
    <div class="render-note">Creates four connected editable walls. Every wall remains independently editable afterwards.</div>`;
  const calc=()=>{const w=Number($('#roomRectWidth').value)||0,l=Number($('#roomRectLength').value)||0;$('#roomRectArea').textContent=`${((w*l)/1e6).toFixed(2)} m²`;};
  $('#roomRectWidth').oninput=calc;$('#roomRectLength').oninput=calc;
  $('#applyRectRoom').onclick=()=>{
    const w=Number($('#roomRectWidth').value),l=Number($('#roomRectLength').value);
    if(!(w>=300&&l>=300)){status('Enter valid room dimensions in mm.');return;}
    const current=readProject();
    if((current?.room?.walls?.length||0)>0&&!confirm('Replace the current room walls? Existing cabinets will be cleared because their wall references would change.'))return;
    if(buildRectangle(w,l)){status(`Room created: ${w} × ${l} mm · ${((w*l)/1e6).toFixed(2)} m²`);location.reload();}
  };
}

function installAreaBadge(){
  const heading=$('.left-panel .panel-heading');if(!heading||$('#roomAreaBadge'))return;
  const el=document.createElement('div');el.id='roomAreaBadge';
  el.style.cssText='font-size:10px;color:#667064;margin:-5px 2px 10px;padding:7px 9px;border:1px solid #ddd9cf;border-radius:8px;background:#f7f7f3;';
  heading.insertAdjacentElement('afterend',el);
  const update=()=>{const p=readProject(),a=roomAreaFromWalls(p);el.textContent=a?`Room area: ${(a/1e6).toFixed(2)} m²`:'Room area: —';};
  update();setInterval(update,800);
}

function installPlanAnalyzer(){
  const upload=$('#floorPlanInput')?.closest('.tool-card');if(!upload||$('#autoBuildPlanBtn'))return;
  const b=document.createElement('button');b.className='tool-card';b.id='autoBuildPlanBtn';
  b.innerHTML='<span class="tool-icon">AI</span><span><b>AI Auto-build from plan</b><small>Analyze dimensions → review → build editable room</small></span>';
  upload.insertAdjacentElement('afterend',b);
  b.onclick=analyzeFloorPlan;
}

function normalizeDimensionToken(raw){
  let s=String(raw||'').trim().toLowerCase().replace(/\s+/g,'');
  if(!s)return null;
  const explicitMM=/mm$/.test(s),explicitCM=/cm$/.test(s),explicitM=/(^|\d)m$/.test(s)&&!explicitMM&&!explicitCM;
  s=s.replace(/mm|cm|m/g,'').replace(/[^0-9.,]/g,'');
  if(!s)return null;
  if(/^\d{1,3},\d{3}$/.test(s))s=s.replace(',','');else s=s.replace(',','.');
  let n=Number(s);if(!Number.isFinite(n)||n<=0)return null;
  if(explicitM)n*=1000;else if(explicitCM)n*=10;else if(!explicitMM){
    if(n>=1000){}else if(n>=100)n*=10;else if(n>=20)n*=10;else n*=1000;
  }
  n=Math.round(n/10)*10;
  return n>=600&&n<=20000?n:null;
}

function scoreDimensions(words){
  const map=new Map();
  for(const w of words||[]){
    const n=normalizeDimensionToken(w.text);if(!n)continue;
    const conf=Number(w.confidence)||0;
    if(conf<20)continue;
    const prev=map.get(n)||{value:n,score:0,count:0,best:0};
    prev.count++;prev.best=Math.max(prev.best,conf);prev.score+=Math.max(5,conf);
    if(n>=1200&&n<=8000)prev.score+=25;
    if(n%10===0)prev.score+=4;
    map.set(n,prev);
  }
  return [...map.values()].sort((a,b)=>b.score-a.score||b.value-a.value);
}

function showPlanAnalysis(candidates){
  const panel=$('#propertiesPanel');if(!panel)return;
  $('#propertyContext').textContent='AI Plan';
  const vals=candidates.map(x=>x.value);
  const width=vals[0]||3000,length=vals[1]||2000;
  const chips=candidates.slice(0,8).map(x=>`<button type="button" class="btn ghost ai-dim-chip" data-value="${x.value}" style="padding:5px 7px;font-size:10px">${x.value} mm</button>`).join('');
  panel.innerHTML=`<div class="prop-card"><h4>AI floor-plan analysis</h4>
    <div class="render-note" style="margin-bottom:10px">Detected dimension candidates are suggestions only. Verify them against the uploaded plan before creating walls.</div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px">${chips||'<span style="font-size:10px;color:#777">No reliable dimensions detected.</span>'}</div>
    <div class="prop-row"><span>Room width</span><input class="prop-input" id="aiRoomWidth" value="${width}"></div>
    <div class="prop-row"><span>Room length</span><input class="prop-input" id="aiRoomLength" value="${length}"></div>
    <div class="prop-row"><span>Area</span><b id="aiRoomArea">${((width*length)/1e6).toFixed(2)} m²</b></div>
    <button class="btn primary full" id="aiBuildRoom" style="margin-top:10px">Build editable room</button>
    <button class="btn ghost full" id="aiAnalyzeAgain" style="margin-top:8px">Analyze again</button></div>
    <div class="render-note">Current beta generates a reliable editable rectangular base from the reviewed dimensions. Irregular/L-shaped automatic wall tracing will be added as a separate vision/vector stage rather than guessed from OCR.</div>`;
  const calc=()=>{const w=Number($('#aiRoomWidth')?.value)||0,l=Number($('#aiRoomLength')?.value)||0;$('#aiRoomArea').textContent=`${((w*l)/1e6).toFixed(2)} m²`;};
  $('#aiRoomWidth').oninput=calc;$('#aiRoomLength').oninput=calc;
  let nextField='width';
  panel.querySelectorAll('.ai-dim-chip').forEach(ch=>ch.onclick=()=>{const id=nextField==='width'?'#aiRoomWidth':'#aiRoomLength';$(id).value=ch.dataset.value;nextField=nextField==='width'?'length':'width';calc();});
  $('#aiBuildRoom').onclick=()=>{
    const w=Number($('#aiRoomWidth').value),l=Number($('#aiRoomLength').value);
    if(!(w>=600&&l>=600)){status('Verify the detected dimensions before building.');return;}
    const p=readProject();
    if((p?.room?.walls?.length||0)>0&&!confirm('Replace the current room walls? Existing cabinets will be cleared.'))return;
    if(buildRectangle(w,l,'ai-assisted-plan')){status(`AI-assisted room base created: ${w} × ${l} mm.`);location.reload();}
  };
  $('#aiAnalyzeAgain').onclick=analyzeFloorPlan;
}

async function analyzeFloorPlan(){
  const p=readProject();if(!p?.floorPlan?.dataUrl){alert('Upload a floor plan image first.');return;}
  if(!window.Tesseract){alert('The floor-plan analysis library did not load. Refresh the page and try again.');return;}
  const btn=$('#autoBuildPlanBtn');if(btn)btn.disabled=true;status('Analyzing floor-plan dimensions…');
  try{
    const result=await window.Tesseract.recognize(p.floorPlan.dataUrl,'eng',{logger:m=>{if(m.status==='recognizing text')status(`Analyzing floor plan… ${Math.round((m.progress||0)*100)}%`);}});
    const words=result?.data?.words||[];
    const candidates=scoreDimensions(words);
    showPlanAnalysis(candidates);
    status(candidates.length?'AI analysis complete. Verify the proposed dimensions before building.':'No reliable dimensions detected. Enter them manually in the review panel.');
  }catch(err){console.error(err);status('Floor-plan analysis failed.');alert('Automatic plan analysis failed on this image. The uploaded plan remains available as a reference.');}
  finally{if(btn)btn.disabled=false;}
}

installRectangleTool();
installAreaBadge();
installPlanAnalyzer();
