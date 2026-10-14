import {boundsOfWalls,displayLength,wallLength,endpointConnected,roomPolygon} from './model.mjs';

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function ceilingPolygon(project){
  const p=project.room.surfaces?.ceiling?.polygon;
  return Array.isArray(p)&&p.length>=3?p:roomPolygon(project);
}

export class StudioRenderer{
  constructor(canvas){
    this.canvas=canvas;
    this.ctx=canvas.getContext('2d');
    this.width=800;this.height=600;this.dpr=1;
    this.view='plan';
    this.camera={cx:0,cy:0,zoom:0.16,yaw:-0.72,pitch:0.55};
    this.selectedId=null;
    this.floorImage=null;
    this.tempWall=null;
    this.tempCeiling=null;
    this.calibrationPoints=[];
  }

  resize(w,h,dpr=window.devicePixelRatio||1){
    this.width=w;this.height=h;this.dpr=Math.min(2,dpr);
    this.canvas.width=Math.round(w*this.dpr);this.canvas.height=Math.round(h*this.dpr);
    this.canvas.style.width=`${w}px`;this.canvas.style.height=`${h}px`;
  }
  setFloorImage(img){this.floorImage=img;}
  setView(v){this.view=v;}
  fit(project){
    const b=boundsOfWalls(project.room.walls);
    this.camera.cx=(b.minX+b.maxX)/2;this.camera.cy=(b.minY+b.maxY)/2;
    const sx=(this.width-160)/Math.max(1,b.maxX-b.minX),sy=(this.height-140)/Math.max(1,b.maxY-b.minY);
    this.camera.zoom=clamp(Math.min(sx,sy),0.025,0.8);
  }
  worldToScreen(p){return{x:this.width/2+(p.x-this.camera.cx)*this.camera.zoom,y:this.height/2+(p.y-this.camera.cy)*this.camera.zoom};}
  screenToWorld(p){return{x:(p.x-this.width/2)/this.camera.zoom+this.camera.cx,y:(p.y-this.height/2)/this.camera.zoom+this.camera.cy};}
  draw(project){
    const c=this.ctx;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.width,this.height);
    if(this.view==='plan')this.drawPlan(project);else this.drawScene(project,this.view==='render');
  }

  drawGrid(project){
    const c=this.ctx,spacing=Math.max(50,project.settings.grid||100),z=this.camera.zoom;let step=spacing;
    while(step*z<18)step*=2;while(step*z>70)step/=2;
    const tl=this.screenToWorld({x:0,y:0}),br=this.screenToWorld({x:this.width,y:this.height});
    const x0=Math.floor(tl.x/step)*step,y0=Math.floor(tl.y/step)*step;c.save();c.lineWidth=1;
    for(let x=x0;x<=br.x;x+=step){const a=this.worldToScreen({x,y:tl.y});c.strokeStyle=Math.abs(x%(step*5))<.1?'#d2d0c8':'#e3e1da';c.beginPath();c.moveTo(a.x,0);c.lineTo(a.x,this.height);c.stroke();}
    for(let y=y0;y<=br.y;y+=step){const a=this.worldToScreen({x:tl.x,y});c.strokeStyle=Math.abs(y%(step*5))<.1?'#d2d0c8':'#e3e1da';c.beginPath();c.moveTo(0,a.y);c.lineTo(this.width,a.y);c.stroke();}c.restore();
  }

  drawFloorPlan(project){
    if(!this.floorImage||!project.floorPlan)return;
    const fp=project.floorPlan,wmm=this.floorImage.naturalWidth*fp.mmPerPixel,hmm=this.floorImage.naturalHeight*fp.mmPerPixel;
    const p=this.worldToScreen({x:fp.x-wmm/2,y:fp.y-hmm/2}),w=wmm*this.camera.zoom,h=hmm*this.camera.zoom,c=this.ctx;
    c.save();c.globalAlpha=fp.opacity??.45;c.drawImage(this.floorImage,p.x,p.y,w,h);c.globalAlpha=1;c.strokeStyle='#8e938a66';c.setLineDash([7,6]);c.strokeRect(p.x,p.y,w,h);c.restore();
  }

  drawFloorSurface(project){
    const floor=project.room.surfaces?.floor,poly=roomPolygon(project);if(!floor?.enabled||!poly)return;
    const c=this.ctx,pts=poly.map(p=>this.worldToScreen(p));c.save();c.beginPath();c.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>c.lineTo(p.x,p.y));c.closePath();c.fillStyle=floor.colour||'#d9d7d0';c.globalAlpha=.62;c.fill();c.clip();c.globalAlpha=1;
    const tw=Math.max(20,floor.tileWidth||600)*this.camera.zoom,th=Math.max(20,floor.tileHeight||1200)*this.camera.zoom;
    if(tw>5&&th>5){c.translate(this.width/2,this.height/2);c.rotate((Number(floor.rotation)||0)*Math.PI/180);c.translate(-this.width/2,-this.height/2);c.strokeStyle='rgba(90,90,80,.18)';c.lineWidth=.7;for(let x=-this.width*2;x<this.width*3;x+=tw){c.beginPath();c.moveTo(x,-this.height*2);c.lineTo(x,this.height*3);c.stroke();}for(let y=-this.height*2;y<this.height*3;y+=th){c.beginPath();c.moveTo(-this.width*2,y);c.lineTo(this.width*3,y);c.stroke();}}
    c.restore();
  }

  wallPlanGeometry(w,project){
    const dx=w.end.x-w.start.x,dy=w.end.y-w.start.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L;
    const es=endpointConnected(project,w,'start')?w.thickness/2:0,ee=endpointConnected(project,w,'end')?w.thickness/2:0;
    const ws={x:w.start.x-ux*es,y:w.start.y-uy*es},we={x:w.end.x+ux*ee,y:w.end.y+uy*ee};
    const a=this.worldToScreen(ws),b=this.worldToScreen(we),s0=this.worldToScreen(w.start),s1=this.worldToScreen(w.end);
    const sx=b.x-a.x,sy=b.y-a.y,len=Math.hypot(sx,sy)||1,nx=-sy/len,ny=sx/len,half=w.thickness*this.camera.zoom/2;
    return{pts:[{x:a.x+nx*half,y:a.y+ny*half},{x:b.x+nx*half,y:b.y+ny*half},{x:b.x-nx*half,y:b.y-ny*half},{x:a.x-nx*half,y:a.y-ny*half}],start:s0,end:s1};
  }
  drawWallPlan(w,project){
    const c=this.ctx,g=this.wallPlanGeometry(w,project),sel=w.id===this.selectedId;c.beginPath();c.moveTo(g.pts[0].x,g.pts[0].y);g.pts.slice(1).forEach(p=>c.lineTo(p.x,p.y));c.closePath();c.fillStyle=sel?'#597151':'#8e9287';c.fill();
    if(sel){c.strokeStyle='#30452d';c.lineWidth=1.5;c.stroke();for(const p of[g.start,g.end]){c.beginPath();c.arc(p.x,p.y,5,0,Math.PI*2);c.fillStyle='#fdfcf8';c.fill();c.strokeStyle='#355133';c.lineWidth=2;c.stroke();}}
    const mid={x:(g.start.x+g.end.x)/2,y:(g.start.y+g.end.y)/2},label=displayLength(wallLength(w),project.settings);c.font='10px Inter,sans-serif';const tw=c.measureText(label).width;c.fillStyle='rgba(252,251,247,.94)';c.fillRect(mid.x-tw/2-5,mid.y-18,tw+10,16);c.fillStyle='#51574f';c.textAlign='center';c.fillText(label,mid.x,mid.y-6);
  }

  drawCeilingPlan(project){
    const ceiling=project.room.surfaces?.ceiling,poly=ceilingPolygon(project);if(!ceiling?.enabled||!poly)return;
    const c=this.ctx,pts=poly.map(p=>this.worldToScreen(p));c.save();c.beginPath();c.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>c.lineTo(p.x,p.y));c.closePath();c.fillStyle=ceiling.colour||'#f4f1e9';c.globalAlpha=.32;c.fill();c.globalAlpha=1;c.strokeStyle=this.selectedId==='surface:ceiling'?'#786d51':'#9a8a68';c.lineWidth=this.selectedId==='surface:ceiling'?2:1;c.setLineDash([7,5]);c.stroke();c.restore();
  }
  drawCeilingDraft(){
    if(!this.tempCeiling?.length)return;const c=this.ctx,pts=this.tempCeiling.map(p=>this.worldToScreen(p));c.save();c.strokeStyle='#a16d3f';c.fillStyle='rgba(219,184,132,.16)';c.lineWidth=2;c.setLineDash([7,5]);c.beginPath();c.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>c.lineTo(p.x,p.y));if(pts.length>=3){c.closePath();c.fill();}c.stroke();for(const p of pts){c.setLineDash([]);c.beginPath();c.arc(p.x,p.y,4,0,Math.PI*2);c.fillStyle='#a16d3f';c.fill();}c.restore();
  }
  drawLightsPlan(project){
    const c=this.ctx;for(const l of project.room.lighting||[]){const p=this.worldToScreen({x:l.x,y:l.y}),r=Math.max(5,Math.min(16,(l.diameter||100)*this.camera.zoom*.25)),sel=l.id===this.selectedId;c.save();c.globalAlpha=l.enabled?1:.35;c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);c.fillStyle=sel?'#f2d37d':'#f4e5b6';c.fill();c.strokeStyle=sel?'#7a6130':'#84795d';c.lineWidth=sel?2:1;c.stroke();c.beginPath();c.moveTo(p.x-r-3,p.y);c.lineTo(p.x+r+3,p.y);c.moveTo(p.x,p.y-r-3);c.lineTo(p.x,p.y+r+3);c.stroke();c.restore();}
  }
  drawPlan(project){
    const c=this.ctx;c.fillStyle='#f6f5f1';c.fillRect(0,0,this.width,this.height);this.drawGrid(project);this.drawFloorPlan(project);this.drawFloorSurface(project);project.room.walls.forEach(w=>this.drawWallPlan(w,project));this.drawCeilingPlan(project);this.drawLightsPlan(project);this.drawCeilingDraft();
    if(this.tempWall){const a=this.worldToScreen(this.tempWall.start),b=this.worldToScreen(this.tempWall.end);c.save();c.strokeStyle='#40553c';c.lineWidth=2;c.setLineDash([7,5]);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.restore();}
    if(this.calibrationPoints.length){c.save();for(const p of this.calibrationPoints){const s=this.worldToScreen(p);c.beginPath();c.arc(s.x,s.y,6,0,Math.PI*2);c.fillStyle='#b16d45';c.fill();}c.restore();}
    if(!project.room.walls.length&&!project.floorPlan){c.textAlign='center';c.fillStyle='#8a8f86';c.font='13px Inter,sans-serif';c.fillText('Blank project',this.width/2,this.height/2-8);c.font='11px Inter,sans-serif';c.fillText('Upload a plan or draw the first wall.',this.width/2,this.height/2+12);}
  }

  hitWall(project,screen,threshold=12){let best=null,bestD=Infinity;for(const w of project.room.walls){const a=this.worldToScreen(w.start),b=this.worldToScreen(w.end),vx=b.x-a.x,vy=b.y-a.y,wx=screen.x-a.x,wy=screen.y-a.y,vv=vx*vx+vy*vy||1,t=clamp((wx*vx+wy*vy)/vv,0,1),px=a.x+t*vx,py=a.y+t*vy,d=Math.hypot(screen.x-px,screen.y-py);if(d<threshold&&d<bestD){best=w;bestD=d;}}return best;}
  hitLight(project,screen,threshold=14){let best=null,bestD=Infinity;for(const l of project.room.lighting||[]){const p=this.worldToScreen({x:l.x,y:l.y}),d=Math.hypot(screen.x-p.x,screen.y-p.y);if(d<threshold&&d<bestD){best=l;bestD=d;}}return best;}

  drawScene(project,highQuality=false){
    const c=this.ctx,g=c.createLinearGradient(0,0,0,this.height);g.addColorStop(0,highQuality?'#d9ddd6':'#e4e5df');g.addColorStop(1,highQuality?'#bfc4ba':'#d1d3cb');c.fillStyle=g;c.fillRect(0,0,this.width,this.height);
    const walls=project.room.walls;if(!walls.length){c.textAlign='center';c.fillStyle='#677067';c.fillText('Draw room walls in 2D to generate the 3D scene.',this.width/2,this.height/2);return;}
    const b=boundsOfWalls(walls),center={x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2},yaw=this.camera.yaw,pitch=this.camera.pitch,co=Math.cos(yaw),si=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const raw=(x,y,z)=>{const xx=x-center.x,zz=-(y-center.y),yy=z-(project.settings.ceilingHeight||2600)*.35,rx=xx*co-zz*si,rz=xx*si+zz*co;return{x:rx,y:-yy*cp-rz*sp,d:rz*cp-yy*sp};};
    const rendered=walls.map(w=>{const dx=w.end.x-w.start.x,dy=w.end.y-w.start.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,es=endpointConnected(project,w,'start')?w.thickness/2:0,ee=endpointConnected(project,w,'end')?w.thickness/2:0;return{w,start:{x:w.start.x-ux*es,y:w.start.y-uy*es},end:{x:w.end.x+ux*ee,y:w.end.y+uy*ee}};});
    const corners=[];for(const rw of rendered){for(const p of[rw.start,rw.end])corners.push(raw(p.x,p.y,0),raw(p.x,p.y,rw.w.height));}const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y)),scale=Math.min((this.width-140)/(maxX-minX||1),(this.height-100)/(maxY-minY||1));
    const pr=(x,y,z)=>{const q=raw(x,y,z);return{x:this.width/2+(q.x-(minX+maxX)/2)*scale,y:this.height/2+(q.y-(minY+maxY)/2)*scale+12,d:q.d};};
    const faces=[];const addFace=(pts,fill,stroke='#56605522')=>{const pp=pts.map(v=>pr(v[0],v[1],v[2]));faces.push({pts:pp,fill,stroke,depth:pp.reduce((s,p)=>s+p.d,0)/pp.length});};
    const fp=roomPolygon(project),floor=project.room.surfaces?.floor;if(fp&&floor?.enabled)addFace(fp.map(p=>[p.x,p.y,0]),floor.colour||'#d9d7d0','#7a786f33');
    for(const rw of rendered){const w=rw.w,dx=rw.end.x-rw.start.x,dy=rw.end.y-rw.start.y,L=Math.hypot(dx,dy)||1,nx=-dy/L*w.thickness/2,ny=dx/L*w.thickness/2,a1=[rw.start.x+nx,rw.start.y+ny,0],a2=[rw.end.x+nx,rw.end.y+ny,0],b1=[rw.start.x-nx,rw.start.y-ny,0],b2=[rw.end.x-nx,rw.end.y-ny,0],h=w.height;addFace([a1,a2,[a2[0],a2[1],h],[a1[0],a1[1],h]],highQuality?'#d8d3c7':'#cbc9c0');addFace([b2,b1,[b1[0],b1[1],h],[b2[0],b2[1],h]],highQuality?'#c9c5ba':'#bbb9b1');addFace([[a1[0],a1[1],h],[a2[0],a2[1],h],[b2[0],b2[1],h],[b1[0],b1[1],h]],highQuality?'#ebe7dc':'#d7d5cd');}
    faces.sort((a,b)=>b.depth-a.depth);for(const f of faces){c.beginPath();c.moveTo(f.pts[0].x,f.pts[0].y);f.pts.slice(1).forEach(p=>c.lineTo(p.x,p.y));c.closePath();c.fillStyle=f.fill;c.fill();c.strokeStyle=f.stroke;c.lineWidth=.65;c.stroke();}

    const ceiling=project.room.surfaces?.ceiling,cpoly=ceilingPolygon(project);
    if(ceiling?.enabled&&ceiling.visible3d&&cpoly){
      const pts=cpoly.map(p=>pr(p.x,p.y,project.settings.ceilingHeight));c.save();c.beginPath();c.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>c.lineTo(p.x,p.y));c.closePath();c.fillStyle=highQuality?'rgba(244,241,233,.90)':'rgba(238,235,226,.82)';c.fill();c.strokeStyle='#8e897d88';c.lineWidth=1;c.stroke();c.restore();
    }
    for(const l of project.room.lighting||[]){if(!l.enabled)continue;const top=pr(l.x,l.y,project.settings.ceilingHeight),bottom=pr(l.x,l.y,Math.max(0,project.settings.ceilingHeight-(l.drop||0))),r=Math.max(4,Math.min(18,(l.diameter||100)*scale*.08));if(highQuality){const glow=c.createRadialGradient(bottom.x,bottom.y,0,bottom.x,bottom.y,Math.max(24,r*5));glow.addColorStop(0,'rgba(255,223,145,.28)');glow.addColorStop(1,'rgba(255,223,145,0)');c.fillStyle=glow;c.beginPath();c.arc(bottom.x,bottom.y,Math.max(24,r*5),0,Math.PI*2);c.fill();}c.strokeStyle='#6f6758';c.beginPath();c.moveTo(top.x,top.y);c.lineTo(bottom.x,bottom.y);c.stroke();c.beginPath();c.arc(bottom.x,bottom.y,r,0,Math.PI*2);c.fillStyle='#d7c59b';c.fill();c.stroke();}
    if(highQuality){c.fillStyle='rgba(255,255,255,.75)';c.font='10px Inter,sans-serif';c.textAlign='left';c.fillText('RENDER PREVIEW · live surfaces + lighting + room geometry',16,22);}
  }
}
