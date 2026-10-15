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

function buildRectangle(width,length){
  const p=readProject();if(!p)return false;
  width=Math.round(Number(width));length=Math.round(Number(length));
  if(width<300||length<300)return false;
  const thickness=Number(p.settings?.defaultWallThickness)||100,height=Number(p.settings?.ceilingHeight)||2600;
  const cx=0,cy=0,x0=cx-width/2,x1=cx+width/2,y0=cy-length/2,y1=cy+length/2;
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
  p.roomTemplate={type:'rectangle',width,length,source:'manual'};
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

installRectangleTool();
installAreaBadge();
