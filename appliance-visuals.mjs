import {StudioRenderer} from './render.mjs';

const STORAGE_KEY='kitchen-studio-project-v2';
const $=s=>document.querySelector(s);
function read(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch{return null;}}
function cabById(p,id){return p?.kitchen?.objects?.find(o=>o.id===id)||null;}
function wallById(p,id){return p?.room?.walls?.find(w=>w.id===id)||null;}
function geometry(p,cab){const w=wallById(p,cab.wallId);if(!w)return null;const dx=w.end.x-w.start.x,dy=w.end.y-w.start.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L;let nx=-uy,ny=ux;if((cab.side||1)<0){nx=-nx;ny=-ny;}const half=(w.thickness||100)/2,bx=w.start.x+ux*cab.offset+nx*half,by=w.start.y+uy*cab.offset+ny*half;const p0={x:bx,y:by},p1={x:bx+ux*cab.width,y:by+uy*cab.width},p2={x:p1.x+nx*cab.depth,y:p1.y+ny*cab.depth},p3={x:p0.x+nx*cab.depth,y:p0.y+ny*cab.depth};return{ux,uy,nx,ny,pts:[p0,p1,p2,p3],frontA:p3,frontB:p2};}
function projector(renderer,p){const walls=p?.room?.walls||[];if(!walls.length)return null;const bb={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};for(const w of walls)for(const q of[w.start,w.end]){bb.minX=Math.min(bb.minX,q.x);bb.maxX=Math.max(bb.maxX,q.x);bb.minY=Math.min(bb.minY,q.y);bb.maxY=Math.max(bb.maxY,q.y);}const center={x:(bb.minX+bb.maxX)/2,y:(bb.minY+bb.maxY)/2},yaw=renderer.camera.yaw,pitch=renderer.camera.pitch,co=Math.cos(yaw),si=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),H=p.settings?.ceilingHeight||2600;const raw=(x,y,z)=>{const xx=x-center.x,zz=-(y-center.y),yy=z-H*.35,rx=xx*co-zz*si,rz=xx*si+zz*co;return{x:rx,y:-yy*cp-rz*sp,d:rz*cp-yy*sp};};const corners=[];for(const w of walls)for(const q of[w.start,w.end])corners.push(raw(q.x,q.y,0),raw(q.x,q.y,w.height||H));const minX=Math.min(...corners.map(q=>q.x)),maxX=Math.max(...corners.map(q=>q.x)),minY=Math.min(...corners.map(q=>q.y)),maxY=Math.max(...corners.map(q=>q.y)),scale=Math.min((renderer.width-140)/(maxX-minX||1),(renderer.height-100)/(maxY-minY||1));return(x,y,z)=>{const q=raw(x,y,z);return{x:renderer.width/2+(q.x-(minX+maxX)/2)*scale,y:renderer.height/2+(q.y-(minY+maxY)/2)*scale+12,d:q.d};};}
function poly(ctx,pts,fill,stroke,line=1){ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}
function line(ctx,a,b,stroke,width=1){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
function drawAppliances(renderer,p){
  if(renderer.view!=='3d'&&renderer.view!=='render')return;const pr=projector(renderer,p);if(!pr)return;const ctx=renderer.ctx,selected=window.__ksScene3D?.selectedApplianceId||null;
  for(const app of p.kitchen?.appliances||[]){const cab=cabById(p,app.hostId),g=cab&&geometry(p,cab);if(!cab||!g)continue;const sel=app.id===selected,stroke=sel?'#214d20':'#313633',sw=sel?3:1.1,span=Math.min(cab.width,app.width||cab.width),start=(cab.width-span)/2;
    if(app.mount==='top'){
      const d=Math.min(cab.depth*.75,app.depth||cab.depth*.7),inset=(cab.depth-d)/2,a={x:g.pts[0].x+g.ux*start+g.nx*inset,y:g.pts[0].y+g.uy*start+g.ny*inset},b={x:a.x+g.ux*span,y:a.y+g.uy*span},c={x:b.x+g.nx*d,y:b.y+g.ny*d},dd={x:a.x+g.nx*d,y:a.y+g.ny*d},z=(cab.bottom||0)+(cab.height||0)+26,pts=[pr(a.x,a.y,z),pr(b.x,b.y,z),pr(c.x,c.y,z),pr(dd.x,dd.y,z)];poly(ctx,pts,app.type==='hob'?'#202523':'#9ca7a1',stroke,sw);continue;
    }
    const out=8,f0={x:g.frontA.x+g.ux*start+g.nx*out,y:g.frontA.y+g.uy*start+g.ny*out},f1={x:f0.x+g.ux*span,y:f0.y+g.uy*span};let z0=Number(app.bottom);if(!Number.isFinite(z0))z0=cab.bottom||0;let z1=z0+(app.height||500);if(app.mount==='front-full'){z0=cab.bottom||0;z1=Math.min((cab.bottom||0)+(cab.height||0),z0+(app.height||cab.height));}
    let fill='#8f9691';if(app.type==='oven')fill='#252a28';else if(app.type==='fridge')fill='#bfc3bf';else if(app.type==='dishwasher')fill='#aeb3af';else if(app.type==='hood')fill='#9ca29e';
    const p0=pr(f0.x,f0.y,z0),p1=pr(f1.x,f1.y,z0),p2=pr(f1.x,f1.y,z1),p3=pr(f0.x,f0.y,z1);poly(ctx,[p0,p1,p2,p3],fill,stroke,sw);
    if(app.type==='fridge'){
      const split=z0+(z1-z0)*0.38,a=pr(f0.x,f0.y,split),b=pr(f1.x,f1.y,split);line(ctx,a,b,'#747b76',1.2);
      const hx=f1.x-g.ux*45,ha=pr(hx,f1.y-g.uy*45,z0+(z1-z0)*.47),hb=pr(hx,f1.y-g.uy*45,z1-120);line(ctx,ha,hb,'#6f7671',2);
    }
    if(app.type==='oven'){
      const handleZ=z1-120,a=pr(f0.x+g.ux*45,f0.y+g.uy*45,handleZ),b=pr(f1.x-g.ux*45,f1.y-g.uy*45,handleZ);line(ctx,a,b,'#c2c7c3',2.2);
      const glass0=pr(f0.x+g.ux*55,f0.y+g.uy*55,z0+70),glass1=pr(f1.x-g.ux*55,f1.y-g.uy*55,z0+70),glass2=pr(f1.x-g.ux*55,f1.y-g.uy*55,z1-170),glass3=pr(f0.x+g.ux*55,f0.y+g.uy*55,z1-170);poly(ctx,[glass0,glass1,glass2,glass3],'#171b1a','#4c5350',.8);
    }
  }
}
const old=StudioRenderer.prototype.draw;if(!StudioRenderer.prototype.__applianceVisualsWrapped){StudioRenderer.prototype.__applianceVisualsWrapped=true;StudioRenderer.prototype.draw=function(project){const out=old.call(this,project);const p=read();if(p)drawAppliances(this,p);return out;};}
