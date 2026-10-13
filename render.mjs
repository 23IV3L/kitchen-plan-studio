import {bounds,cabinetBounds,TYPES} from './model.mjs';

const colour=(hex,f=1)=>{const n=hex.replace('#','');return '#'+[0,2,4].map(i=>Math.max(0,Math.min(255,Math.round(parseInt(n.slice(i,i+2),16)*f))).toString(16).padStart(2,'0')).join('')};
function poly(ctx,points,fill,stroke='#40473822',width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}}
export function inside(point,polygon){let ok=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)ok=!ok}return ok;}

export class PlannerRenderer{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.view='3d';this.yaw=-.68;this.pitch=.53;this.zoom=1;this.hits=[];this.planTransform=null;this.width=800;this.height=550;this.dpr=1;}
 resize(width,height,dpr=1){this.width=width;this.height=height;this.dpr=Math.min(2,dpr);this.canvas.width=Math.round(width*this.dpr);this.canvas.height=Math.round(height*this.dpr);}
 reset(){this.yaw=-.68;this.pitch=.53;this.zoom=1;}
 hit(x,y){return [...this.hits].reverse().find(p=>inside({x,y},p.points))?.id||null;}
 draw(project,selected){const c=this.ctx;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.width,this.height);c.fillStyle=this.view==='plan'?'#fafbf6':'#ebece5';c.fillRect(0,0,this.width,this.height);this.hits=[];if(this.view==='plan')this.drawPlan(project,selected);else this.draw3d(project,selected);}

 drawPlan(project,selected){
  const r=project.room,c=this.ctx,s=Math.min((this.width-150)/r.width,(this.height-180)/r.length)*this.zoom,ox=(this.width-r.width*s)/2,oy=(this.height-r.length*s)/2+12;
  this.planTransform={s,ox,oy};
  const p=(x,z)=>({x:ox+x*s,y:oy+(r.length-z)*s});
  const rect=(x,z,w,d)=>[p(x,z),p(x+w,z),p(x+w,z+d),p(x,z+d)];
  poly(c,rect(0,0,r.width,r.length),'#f0eee2','#9a9d8f',1);
  c.save();c.strokeStyle='#dde0d5';c.lineWidth=.5;
  for(let x=0;x<=r.width;x+=100){const a=p(x,0),b=p(x,r.length);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke()}
  for(let z=0;z<=r.length;z+=100){const a=p(0,z),b=p(r.width,z);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke()}
  c.restore();
  poly(c,rect(-70,0,70,r.length+70),'#a7ad9a',null);poly(c,rect(0,r.length,r.width+70,70),'#a7ad9a',null);poly(c,rect(r.width,0,70,r.length),'#a7ad9a',null);
  const reserve=rect(0,r.length-r.corner,r.corner,r.corner);c.save();c.setLineDash([4,4]);poly(c,reserve,null,'#7d896e',1);c.restore();
  const cp=p(r.corner/2,r.length-r.corner/2),hasCorner=project.cabinets.some(u=>u.type==='corner'||u.type==='cornerUpper'||u.type==='upperLCorner');
  if(!hasCorner){c.fillStyle='#68725c';c.font='10px Arial';c.textAlign='center';c.fillText('CORNER',cp.x,cp.y-3);c.font='9px Arial';c.fillText('reserved',cp.x,cp.y+11)}
  const ordered=[...project.cabinets].sort((a,b)=>(TYPES[a.type].kind==='upper')-(TYPES[b.type].kind==='upper'));
  for(const u of ordered){
   const upper=TYPES[u.type].kind==='upper',pieces=cabinetBounds(u,r);
   for(const b of pieces){const points=rect(b.x,b.z,b.w,b.d);c.save();if(upper){c.setLineDash([5,4]);c.globalAlpha=.86}poly(c,points,upper?colour(u.colour,1.06):u.colour,u.id===selected?'#334a26':upper?'#566847':'#555e4d',u.id===selected?2.5:1);c.restore();this.hits.push({id:u.id,points})}
   if(u.type==='upperLCorner'){const pc=p(r.upperDepth/2,r.length-r.corner/2);c.fillStyle='#39472e';c.font='bold 9px Arial';c.textAlign='center';c.fillText('L-CORNER',pc.x,pc.y-3);continue}
   const b=bounds(u,r),pc=p(b.x+b.w*.5,b.z+b.d*.5);c.fillStyle=upper?'#39472e':'#fff';c.font='bold 11px Arial';c.textAlign='center';c.fillText(TYPES[u.type].short,pc.x,pc.y-3);c.font='9px Arial';c.fillText(String(u.width),pc.x,pc.y+11);if(upper){const t=p(b.x+b.w/2,b.z+b.d);c.fillStyle='#53684a';c.font='8px Arial';c.fillText('UPPER',t.x,t.y-5)}
  }
  const dim=(a,b,text,vertical=false)=>{c.strokeStyle='#9ca38f';c.lineWidth=.8;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);if(vertical){c.moveTo(a.x-4,a.y);c.lineTo(a.x+4,a.y);c.moveTo(b.x-4,b.y);c.lineTo(b.x+4,b.y)}else{c.moveTo(a.x,a.y-4);c.lineTo(a.x,a.y+4);c.moveTo(b.x,b.y-4);c.lineTo(b.x,b.y+4)}c.stroke();c.save();c.translate((a.x+b.x)/2,(a.y+b.y)/2);if(vertical)c.rotate(-Math.PI/2);c.fillStyle='#68715d';c.font='11px Arial';c.textAlign='center';c.fillText(text,0,-7);c.restore()};
  dim({x:ox,y:oy-27},{x:ox+r.width*s,y:oy-27},r.width.toLocaleString()+' mm · RETURN');dim({x:ox-34,y:oy},{x:ox-34,y:oy+r.length*s},r.length.toLocaleString()+' mm · MAIN RUN',true);
  c.fillStyle='#7e8674';c.font='10px Arial';c.textAlign='center';c.fillText('ENTRANCE / OPEN END',ox+r.width*s/2,oy+r.length*s+25);c.font='9px Arial';c.fillText('Dashed outlines = upper cabinets',this.width/2,this.height-30);
 }

 draw3d(project,selected){
  const r=project.room,c=this.ctx,yaw=this.yaw,pitch=this.pitch,co=Math.cos(yaw),si=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const projectRaw=v=>{const x=v[0]-r.width/2,y=v[1]-r.height*.43,z=v[2]-r.length/2,rx=x*co-z*si,rz=x*si+z*co;return {x:rx,y:-y*cp-rz*sp,depth:rz*cp-y*sp}};
  const limits=[];for(const x of [0,r.width])for(const y of [0,r.height])for(const z of [0,r.length])limits.push(projectRaw([x,y,z]));
  const minX=Math.min(...limits.map(p=>p.x)),maxX=Math.max(...limits.map(p=>p.x)),minY=Math.min(...limits.map(p=>p.y)),maxY=Math.max(...limits.map(p=>p.y)),scale=Math.min((this.width-105)/(maxX-minX),(this.height-100)/(maxY-minY))*this.zoom;
  const pr=v=>{const p=projectRaw(v);return {x:this.width/2+(p.x-(minX+maxX)/2)*scale,y:this.height/2+(p.y-(minY+maxY)/2)*scale+3,depth:p.depth}};
  const faces=[];
  const face=(pts,fill,id=null,stroke='#43493430')=>{const points=pts.map(pr);faces.push({points,fill,id,stroke,depth:points.reduce((s,p)=>s+p.depth,0)/points.length})};
  const box=(x,y,z,w,h,d,fill,id=null)=>{const p=[[x,y,z],[x+w,y,z],[x+w,y,z+d],[x,y,z+d],[x,y+h,z],[x+w,y+h,z],[x+w,y+h,z+d],[x,y+h,z+d]];face([p[0],p[1],p[5],p[4]],colour(fill,.96),id);face([p[1],p[2],p[6],p[5]],colour(fill,.89),id);face([p[2],p[3],p[7],p[6]],colour(fill,.82),id);face([p[3],p[0],p[4],p[7]],colour(fill,.84),id);face([p[4],p[5],p[6],p[7]],colour(fill,1.08),id)};
  box(0,-60,0,r.width,60,r.length,r.floorColour);box(-70,0,0,70,170,r.length+70,r.wallColour);box(0,0,r.length,r.width+70,170,70,r.wallColour);box(r.width,0,0,70,170,r.length,r.wallColour);
  if(project.cabinets.some(u=>TYPES[u.type].kind==='base')&&!project.cabinets.some(u=>u.type==='corner')){box(0,0,r.length-r.corner,r.corner,r.worktop-r.topThickness,r.corner,'#a9ac9b');box(0,r.worktop-r.topThickness,r.length-r.corner,r.corner,r.topThickness,r.corner,r.topColour)}

  for(const u of project.cabinets){
   const k=TYPES[u.type].kind;
   if(u.type==='upperLCorner'){
    for(const b of cabinetBounds(u,r))box(b.x,b.y,b.z,b.w,b.h,b.d,u.colour,u.id);
    const d=r.upperDepth,y=u.bottom,h=u.height,z0=r.length-r.corner,zf=r.length-d;
    face([[d+2,y+3,z0+3],[d+2,y+3,r.length-3],[d+2,y+h-3,r.length-3],[d+2,y+h-3,z0+3]],colour(u.colour,1.025),u.id);
    face([[d+5,y+35,z0+180],[d+5,y+35,z0+420],[d+5,y+45,z0+420],[d+5,y+45,z0+180]],'#333830',u.id);
    face([[3,y+3,zf-2],[r.corner-3,y+3,zf-2],[r.corner-3,y+h-3,zf-2],[3,y+h-3,zf-2]],colour(u.colour,1.025),u.id);
    face([[180,y+35,zf-5],[420,y+35,zf-5],[420,y+45,zf-5],[180,y+45,zf-5]],'#333830',u.id);
    continue;
   }
   const b=bounds(u,r);box(b.x,b.y,b.z,b.w,b.h,b.d,u.colour,u.id);if(k!=='upper'&&u.bottom>0)box(b.x+15,0,b.z+15,Math.max(10,b.w-30),u.bottom,Math.max(10,b.d-30),colour(u.colour,.68),u.id);
   const surface=(along,y,width,height,fill,offset=2)=>{if(u.wall==='main')face([[b.x+b.w+offset,y,b.z+along],[b.x+b.w+offset,y,b.z+along+width],[b.x+b.w+offset,y+height,b.z+along+width],[b.x+b.w+offset,y+height,b.z+along]],fill,u.id);else face([[b.x+along,y,b.z-offset],[b.x+along+width,y,b.z-offset],[b.x+along+width,y+height,b.z-offset],[b.x+along,y+height,b.z-offset]],fill,u.id)};
   const handle=(along,y,len)=>surface(along,y,len,10,'#333830',5);
   if(u.front==='double'){surface(3,b.y+3,u.width/2-5,b.h-6,colour(u.colour,1.025));surface(u.width/2+2,b.y+3,u.width/2-5,b.h-6,colour(u.colour,1.025));handle(Math.max(8,u.width/2-100),b.y+b.h*.75,80);handle(u.width/2+20,b.y+b.h*.75,80)}
   else if(u.front==='drawers'){for(let i=0;i<3;i++){const h=b.h/3;surface(3,b.y+i*h+3,u.width-6,h-6,colour(u.colour,1.025));handle(u.width*.28,b.y+(i+1)*h-35,u.width*.44)}}
   else if(u.front==='appliance'){const oh=Math.min(590,b.h*.3),oy=b.y+b.h*.30,mh=Math.min(370,b.h*.18),my=oy+oh+45;surface(25,oy,u.width-50,oh,'#252927',5);surface(50,oy+55,u.width-100,oh-150,'#39413d',6);surface(40,oy+oh-70,u.width-80,15,'#92998b',7);surface(25,my,u.width-50,mh,'#252927',5);surface(50,my+40,u.width-100,mh-100,'#39413d',6);surface(40,my+mh-40,u.width-80,10,'#92998b',7)}
   else if(u.type==='corner'){surface(3,b.y+3,u.width-6,b.h-6,colour(u.colour,1.025));handle(u.width*.2,b.y+b.h-50,u.width*.6);face([[b.x+3,b.y+3,b.z-2],[b.x+b.w-3,b.y+3,b.z-2],[b.x+b.w-3,b.y+b.h-3,b.z-2],[b.x+3,b.y+b.h-3,b.z-2]],colour(u.colour,1.025),u.id);face([[b.x+b.w*.2,b.y+b.h-55,b.z-7],[b.x+b.w*.8,b.y+b.h-55,b.z-7],[b.x+b.w*.8,b.y+b.h-45,b.z-7],[b.x+b.w*.2,b.y+b.h-45,b.z-7]],'#333830',u.id)}
   else{surface(3,b.y+3,u.width-6,b.h-6,colour(u.colour,1.025));handle(u.width*.2,k==='upper'?b.y+35:b.y+b.h-50,u.width*.6);if(u.type==='fridge'){surface(4,b.y+b.h*.3,u.width-8,6,colour(u.colour,.5),5);handle(u.width*.2,b.y+b.h*.3-35,u.width*.6)}}
   if(k==='base'){const ty=b.y+b.h;box(b.x,ty,b.z,b.w,r.topThickness,b.d,r.topColour,u.id);const top=ty+r.topThickness+2;if(u.type==='hob'){const hx=b.x+b.w*.12,hz=b.z+b.d*.12,hw=b.w*.76,hd=b.d*.76;face([[hx,top,hz],[hx+hw,top,hz],[hx+hw,top,hz+hd],[hx,top,hz+hd]],'#292e29',u.id);for(const xx of [.30,.70])for(const zz of [.30,.70]){const pts=[];for(let a=0;a<24;a++){const angle=a/24*Math.PI*2;pts.push([hx+hw*xx+55*Math.cos(angle),top+1,hz+hd*zz+55*Math.sin(angle)])}face(pts,'#41483f',u.id,'#77806c')}}if(u.type==='sink'){const sx=b.x+b.w*.18,sz=b.z+b.d*.18,sw=b.w*.64,sd=b.d*.60;face([[sx,top,sz],[sx+sw,top,sz],[sx+sw,top,sz+sd],[sx,top,sz+sd]],'#384039',u.id);face([[sx+18,top+1,sz+18],[sx+sw-18,top+1,sz+18],[sx+sw-18,top+1,sz+sd-18],[sx+18,top+1,sz+sd-18]],'#525c51',u.id);box(b.x+b.w*.5,top,b.z+b.d*.86,18,220,18,'#3b4339',u.id)}}
  }

  faces.sort((a,b)=>b.depth-a.depth);for(const f of faces){poly(c,f.points,f.fill,f.id&&f.id===selected?'#647c4b':f.stroke,f.id&&f.id===selected?1.5:.65);if(f.id)this.hits.push(f)}
  c.save();c.strokeStyle='#717e5b50';c.lineWidth=.8;c.setLineDash([4,5]);for(const [x,z] of [[0,0],[0,r.length],[r.width,r.length],[r.width,0]]){const a=pr([x,0,z]),b=pr([x,r.height,z]);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke()}for(const [a,b] of [[[0,r.height,0],[0,r.height,r.length]],[[0,r.height,r.length],[r.width,r.height,r.length]],[[r.width,r.height,r.length],[r.width,r.height,0]]]){const p=pr(a),q=pr(b);c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke()}c.restore();
  const label=(at,text)=>{const p=pr(at);c.font='10px Arial';c.textAlign='center';const w=c.measureText(text).width;c.fillStyle='#f9fbf1e6';c.fillRect(p.x-w/2-6,p.y-10,w+12,17);c.fillStyle='#657357';c.fillText(text,p.x,p.y+2)};label([r.width/2,0,-160],'ENTRANCE');label([-160,0,r.length/2],r.length+' mm');label([r.width/2,0,r.length+190],r.width+' mm');label([0,r.height+80,r.length],r.height+' mm ceiling');
 }
}
