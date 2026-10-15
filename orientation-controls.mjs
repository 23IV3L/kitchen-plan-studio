const STORAGE_KEY='kitchen-studio-project-v2';
const $=s=>document.querySelector(s);
let busy=false;

function read(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch{return null;}}
function writeSilent(p){p.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(p));}
function pointInPolygon(pt,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],hit=((a.y>pt.y)!==(b.y>pt.y))&&(pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y+1e-9)+a.x);if(hit)inside=!inside;}return inside;}
function roomPolygon(project){
  const walls=(project?.room?.walls||[]).filter(w=>w.connectionMode==='connected');if(walls.length<3)return null;
  const byJoint=new Map();for(const w of walls){for(const key of['start','end']){const id=w[`${key}JointId`];if(!id)continue;if(!byJoint.has(id))byJoint.set(id,[]);byJoint.get(id).push({wall:w,key});}}
  const usable=walls.filter(w=>byJoint.get(w.startJointId)?.length===2&&byJoint.get(w.endJointId)?.length===2);if(usable.length<3)return null;
  const first=usable[0],pts=[{...first.start},{...first.end}];let current=first,joint=first.endJointId,guard=0;
  while(joint!==first.startJointId&&guard++<usable.length+2){const links=(byJoint.get(joint)||[]).filter(e=>e.wall.id!==current.id);if(links.length!==1)return null;const next=links[0].wall,key=links[0].key,other=key==='start'?'end':'start';current=next;joint=next[`${other}JointId`];pts.push({...next[other]});}
  if(joint!==first.startJointId)return null;pts.pop();return pts.length>=3?pts:null;
}
function desiredInteriorSide(project,cab,poly){
  const wall=project.room?.walls?.find(w=>w.id===cab.wallId);if(!wall||!poly)return cab.side||1;
  const dx=wall.end.x-wall.start.x,dy=wall.end.y-wall.start.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,nx=-uy,ny=ux;
  const along=Math.max(0,Math.min(L,(cab.offset||0)+(cab.width||600)/2)),mx=wall.start.x+ux*along,my=wall.start.y+uy*along;
  const test=Math.max((wall.thickness||100)/2+Math.min((cab.depth||560)*.55,320),140);
  const plus={x:mx+nx*test,y:my+ny*test},minus={x:mx-nx*test,y:my-ny*test},pin=pointInPolygon(plus,poly),min=pointInPolygon(minus,poly);
  if(pin&&!min)return 1;if(min&&!pin)return-1;return cab.side||1;
}
function syncOrientation(){
  if(busy)return;const p=read();if(!p?.kitchen?.objects?.length)return;const poly=roomPolygon(p);if(!poly)return;let changed=false;
  for(const cab of p.kitchen.objects){if(cab.manualSide)continue;const next=desiredInteriorSide(p,cab,poly);if((cab.side||1)!==next){cab.side=next;changed=true;}for(const app of p.kitchen.appliances||[]){if(app.hostId===cab.id&&app.side!==cab.side){app.side=cab.side;changed=true;}}}
  if(changed){busy=true;writeSilent(p);requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));busy=false;});}
}
function selectedApplianceId(){return window.__ksScene3D?.selectedApplianceId||window.__ksSelectedApplianceId||null;}
function flipCabinet(id){const p=read(),cab=p?.kitchen?.objects?.find(o=>o.id===id);if(!cab)return;cab.side=(cab.side||1)*-1;cab.manualSide=true;for(const app of p.kitchen.appliances||[]){if(app.hostId===cab.id)app.side=cab.side;}writeSilent(p);window.dispatchEvent(new Event('resize'));}
function flipSelected(){
  const p=read();if(!p)return;const context=$('#propertyContext')?.textContent?.trim();let cabId=null;
  if(context==='Cabinet'){const ids=window.__ksCabinetSelection?.ids||[];if(ids.length===1)cabId=ids[0];}
  if(context==='Appliance'){const aid=selectedApplianceId(),app=(p.kitchen?.appliances||[]).find(a=>a.id===aid);cabId=app?.hostId||null;}
  if(cabId)flipCabinet(cabId);
}
function installButton(){
  const panel=$('#propertiesPanel'),ctx=$('#propertyContext')?.textContent?.trim();if(!panel)return;const oneCab=ctx==='Cabinet'&&(window.__ksCabinetSelection?.ids||[]).length===1,oneApp=ctx==='Appliance'&&!!selectedApplianceId();
  let btn=$('#ksFlipFacing');if(!(oneCab||oneApp)){btn?.remove();return;}
  if(btn)return;btn=document.createElement('button');btn.id='ksFlipFacing';btn.className='btn ghost full';btn.style.marginTop='8px';btn.textContent='Flip facing / wall side';btn.onclick=flipSelected;
  const card=panel.querySelector('.prop-card');card?.appendChild(btn);
}
function capture2DAppliance(e){
  if(e.target?.id!=='workspaceCanvas'||$('.view-btn.active')?.dataset.view!=='plan')return;const r=window.__ksScene3D?.renderer;if(!r)return;const p=read();if(!p?.kitchen?.appliances?.length)return;
  const rect=e.target.getBoundingClientRect(),screen={x:e.clientX-rect.left,y:e.clientY-rect.top};
  for(const app of [...p.kitchen.appliances].reverse()){
    const cab=p.kitchen.objects?.find(o=>o.id===app.hostId),wall=cab&&p.room?.walls?.find(w=>w.id===cab.wallId);if(!cab||!wall)continue;
    const dx=wall.end.x-wall.start.x,dy=wall.end.y-wall.start.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L;let nx=-uy,ny=ux;if((cab.side||1)<0){nx=-nx;ny=-ny;}const half=(wall.thickness||100)/2,bx=wall.start.x+ux*cab.offset+nx*half,by=wall.start.y+uy*cab.offset+ny*half,span=Math.min(cab.width,app.width||cab.width),off=(cab.width-span)/2,depth=app.mount==='top'?Math.min(cab.depth,app.depth||cab.depth):Math.min(cab.depth,Math.max(120,cab.depth*.45));
    const a={x:bx+ux*off,y:by+uy*off},b={x:a.x+ux*span,y:a.y+uy*span},c={x:b.x+nx*depth,y:b.y+ny*depth},d={x:a.x+nx*depth,y:a.y+ny*depth},poly=[a,b,c,d].map(q=>r.worldToScreen(q));
    if(pointInPolygon(screen,poly)){window.__ksSelectedApplianceId=app.id;setTimeout(installButton,0);return;}
  }
}
window.addEventListener('resize',()=>{syncOrientation();setTimeout(installButton,0);});
document.addEventListener('pointerdown',capture2DAppliance,true);
const props=$('#propertiesPanel');if(props)new MutationObserver(()=>setTimeout(installButton,0)).observe(props,{childList:true,subtree:true});
setTimeout(()=>{syncOrientation();installButton();},100);
