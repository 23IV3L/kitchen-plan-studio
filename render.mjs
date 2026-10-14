import {boundsOfWalls,displayLength,wallLength} from './model.mjs';

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

export class StudioRenderer{
  constructor(canvas){
    this.canvas=canvas;
    this.ctx=canvas.getContext('2d');
    this.width=800;this.height=600;this.dpr=1;
    this.view='plan';
    this.camera={cx:0,cy:0,zoom:0.16,yaw:-0.72,pitch:0.55};
    this.selectedId=null;
    this.hoverId=null;
    this.floorImage=null;
    this.tempWall=null;
    this.calibrationPoints=[];
  }

  resize(w,h,dpr=window.devicePixelRatio||1){
    this.width=w;this.height=h;this.dpr=Math.min(2,dpr);
    this.canvas.width=Math.round(w*this.dpr);
    this.canvas.height=Math.round(h*this.dpr);
    this.canvas.style.width=`${w}px`;
    this.canvas.style.height=`${h}px`;
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
  }

  setFloorImage(img){this.floorImage=img;}
  setView(v){this.view=v;}

  fit(project){
    const b=boundsOfWalls(project.room.walls);
    this.camera.cx=(b.minX+b.maxX)/2;
    this.camera.cy=(b.minY+b.maxY)/2;
    const sx=(this.width-160)/Math.max(1,b.maxX-b.minX);
    const sy=(this.height-140)/Math.max(1,b.maxY-b.minY);
    this.camera.zoom=clamp(Math.min(sx,sy),0.025,0.8);
  }

  worldToScreen(p){
    return {x:this.width/2+(p.x-this.camera.cx)*this.camera.zoom,y:this.height/2+(p.y-this.camera.cy)*this.camera.zoom};
  }

  screenToWorld(p){
    return {x:(p.x-this.width/2)/this.camera.zoom+this.camera.cx,y:(p.y-this.height/2)/this.camera.zoom+this.camera.cy};
  }

  draw(project){
    const c=this.ctx;
    c.setTransform(this.dpr,0,0,this.dpr,0,0);
    c.clearRect(0,0,this.width,this.height);
    if(this.view==='plan') this.drawPlan(project);
    else this.drawScene(project,this.view==='render');
  }

  drawGrid(project){
    const c=this.ctx;
    const spacing=Math.max(50,project.settings.grid||100);
    const z=this.camera.zoom;
    let step=spacing;
    while(step*z<18) step*=2;
    while(step*z>70) step/=2;
    const tl=this.screenToWorld({x:0,y:0});
    const br=this.screenToWorld({x:this.width,y:this.height});
    const x0=Math.floor(tl.x/step)*step;
    const y0=Math.floor(tl.y/step)*step;
    c.save();c.lineWidth=1;
    for(let x=x0;x<=br.x;x+=step){
      const a=this.worldToScreen({x,y:tl.y});
      c.strokeStyle=Math.abs(x%(step*5))<.1?'#d2d0c8':'#e3e1da';
      c.beginPath();c.moveTo(a.x,0);c.lineTo(a.x,this.height);c.stroke();
    }
    for(let y=y0;y<=br.y;y+=step){
      const a=this.worldToScreen({x:tl.x,y});
      c.strokeStyle=Math.abs(y%(step*5))<.1?'#d2d0c8':'#e3e1da';
      c.beginPath();c.moveTo(0,a.y);c.lineTo(this.width,a.y);c.stroke();
    }
    c.restore();
  }

  drawFloorPlan(project){
    if(!this.floorImage||!project.floorPlan) return;
    const fp=project.floorPlan;
    const widthMm=this.floorImage.naturalWidth*fp.mmPerPixel;
    const heightMm=this.floorImage.naturalHeight*fp.mmPerPixel;
    const p=this.worldToScreen({x:fp.x-widthMm/2,y:fp.y-heightMm/2});
    const w=widthMm*this.camera.zoom,h=heightMm*this.camera.zoom;
    const c=this.ctx;
    c.save();c.globalAlpha=fp.opacity??0.45;c.drawImage(this.floorImage,p.x,p.y,w,h);c.globalAlpha=1;
    c.strokeStyle='#8e938a66';c.setLineDash([7,6]);c.strokeRect(p.x,p.y,w,h);c.restore();
  }

  drawWallPlan(w,project){
    const c=this.ctx;
    const a=this.worldToScreen(w.start),b=this.worldToScreen(w.end);
    const dx=b.x-a.x,dy=b.y-a.y;
    const len=Math.hypot(dx,dy)||1;
    const nx=-dy/len,ny=dx/len;
    const half=(w.thickness*this.camera.zoom)/2;
    const pts=[{x:a.x+nx*half,y:a.y+ny*half},{x:b.x+nx*half,y:b.y+ny*half},{x:b.x-nx*half,y:b.y-ny*half},{x:a.x-nx*half,y:a.y-ny*half}];
    c.beginPath();c.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>c.lineTo(p.x,p.y));c.closePath();
    c.fillStyle=w.id===this.selectedId?'#597151':'#8e9287';c.fill();
    c.strokeStyle=w.id===this.selectedId?'#30452d':'#70756d';c.lineWidth=1;c.stroke();
    if(w.id===this.selectedId){
      for(const p of [a,b]){c.beginPath();c.arc(p.x,p.y,5,0,Math.PI*2);c.fillStyle='#fdfcf8';c.fill();c.strokeStyle='#355133';c.lineWidth=2;c.stroke();}
    }
    const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const label=displayLength(wallLength(w),project.settings);
    c.font='10px Inter, sans-serif';const tw=c.measureText(label).width;
    c.fillStyle='rgba(252,251,247,.94)';c.fillRect(mid.x-tw/2-5,mid.y-18,tw+10,16);
    c.fillStyle='#51574f';c.textAlign='center';c.fillText(label,mid.x,mid.y-6);
  }

  drawPlan(project){
    const c=this.ctx;c.fillStyle='#f6f5f1';c.fillRect(0,0,this.width,this.height);
    this.drawGrid(project);this.drawFloorPlan(project);
    project.room.walls.forEach(w=>this.drawWallPlan(w,project));
    if(this.tempWall){
      const a=this.worldToScreen(this.tempWall.start),b=this.worldToScreen(this.tempWall.end);
      c.save();c.strokeStyle='#40553c';c.lineWidth=2;c.setLineDash([7,5]);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.restore();
    }
    if(this.calibrationPoints.length){
      c.save();
      for(const p of this.calibrationPoints){const s=this.worldToScreen(p);c.beginPath();c.arc(s.x,s.y,6,0,Math.PI*2);c.fillStyle='#b16d45';c.fill();c.strokeStyle='white';c.lineWidth=2;c.stroke();}
      if(this.calibrationPoints.length===2){const a=this.worldToScreen(this.calibrationPoints[0]);const b=this.worldToScreen(this.calibrationPoints[1]);c.strokeStyle='#b16d45';c.lineWidth=2;c.setLineDash([5,4]);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}
      c.restore();
    }
    if(!project.room.walls.length && !project.floorPlan){
      c.textAlign='center';c.fillStyle='#8a8f86';c.font='13px Inter, sans-serif';c.fillText('Blank project',this.width/2,this.height/2-8);
      c.font='11px Inter, sans-serif';c.fillText('Upload a plan or draw the first wall.',this.width/2,this.height/2+12);
    }
  }

  hitWall(project,screen,threshold=12){
    let best=null,bestD=Infinity;
    for(const w of project.room.walls){
      const a=this.worldToScreen(w.start),b=this.worldToScreen(w.end);
      const vx=b.x-a.x,vy=b.y-a.y,wx=screen.x-a.x,wy=screen.y-a.y,vv=vx*vx+vy*vy||1;
      const t=clamp((wx*vx+wy*vy)/vv,0,1),px=a.x+t*vx,py=a.y+t*vy,d=Math.hypot(screen.x-px,screen.y-py);
      if(d<threshold && d<bestD){best=w;bestD=d;}
    }
    return best;
  }

  drawScene(project,highQuality=false){
    const c=this.ctx;
    const g=c.createLinearGradient(0,0,0,this.height);g.addColorStop(0,highQuality?'#d9ddd6':'#e4e5df');g.addColorStop(1,highQuality?'#bfc4ba':'#d1d3cb');
    c.fillStyle=g;c.fillRect(0,0,this.width,this.height);
    const walls=project.room.walls;
    if(!walls.length){c.textAlign='center';c.fillStyle='#677067';c.font='13px Inter,sans-serif';c.fillText('Draw room walls in 2D to generate the 3D scene.',this.width/2,this.height/2);return;}
    const b=boundsOfWalls(walls),center={x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2};
    const yaw=this.camera.yaw,pitch=this.camera.pitch,co=Math.cos(yaw),si=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);

    // 2D plan coordinates use +Y downward on screen. 3D uses a right-handed floor plane,
    // so plan Y must become -Z. Without this inversion the room appears mirrored in 3D.
    const raw=(x,y,z)=>{
      const xx=x-center.x;
      const zz=-(y-center.y);
      const yy=z-(project.settings.ceilingHeight||2600)*.35;
      const rx=xx*co-zz*si,rz=xx*si+zz*co;
      return{x:rx,y:-yy*cp-rz*sp,d:rz*cp-yy*sp};
    };

    const corners=[];for(const w of walls){for(const p of [w.start,w.end])corners.push(raw(p.x,p.y,0),raw(p.x,p.y,w.height));}
    const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
    const scale=Math.min((this.width-140)/(maxX-minX||1),(this.height-100)/(maxY-minY||1));
    const pr=(x,y,z)=>{const q=raw(x,y,z);return{x:this.width/2+(q.x-(minX+maxX)/2)*scale,y:this.height/2+(q.y-(minY+maxY)/2)*scale+12,d:q.d};};
    const faces=[];
    const addFace=(pts,fill,stroke='#56605555')=>{const pp=pts.map(v=>pr(v[0],v[1],v[2]));faces.push({pts:pp,fill,stroke,depth:pp.reduce((s,p)=>s+p.d,0)/pp.length});};
    for(const w of walls){
      const dx=w.end.x-w.start.x,dy=w.end.y-w.start.y,L=Math.hypot(dx,dy)||1,nx=-dy/L*(w.thickness/2),ny=dx/L*(w.thickness/2);
      const a1=[w.start.x+nx,w.start.y+ny,0],a2=[w.end.x+nx,w.end.y+ny,0],b1=[w.start.x-nx,w.start.y-ny,0],b2=[w.end.x-nx,w.end.y-ny,0],h=w.height;
      addFace([a1,a2,[a2[0],a2[1],h],[a1[0],a1[1],h]],highQuality?'#d8d3c7':'#cbc9c0');
      addFace([b2,b1,[b1[0],b1[1],h],[b2[0],b2[1],h]],highQuality?'#c9c5ba':'#bbb9b1');
      addFace([[a1[0],a1[1],h],[a2[0],a2[1],h],[b2[0],b2[1],h],[b1[0],b1[1],h]],highQuality?'#ebe7dc':'#d7d5cd');
    }
    faces.sort((a,b)=>b.depth-a.depth);
    for(const f of faces){c.beginPath();c.moveTo(f.pts[0].x,f.pts[0].y);f.pts.slice(1).forEach(p=>c.lineTo(p.x,p.y));c.closePath();c.fillStyle=f.fill;c.fill();c.strokeStyle=f.stroke;c.lineWidth=1;c.stroke();}
    if(highQuality){c.fillStyle='rgba(255,255,255,.7)';c.font='10px Inter,sans-serif';c.textAlign='left';c.fillText('RENDER PREVIEW · scene geometry from live project model',16,22);}
  }
}
