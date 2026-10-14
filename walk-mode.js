(()=>{
  const STORAGE_KEY='kitchen-studio-project-v2';
  const $=s=>document.querySelector(s);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const state={active:false,keys:new Set(),drag:false,last:null,camera:{x:0,y:0,z:1650,yaw:0,pitch:0,fov:68},raf:0,lastT:0};

  function projectData(){
    try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch{return null;}
  }

  function roomPolygon(project){
    const walls=(project?.room?.walls||[]).filter(w=>w.connectionMode==='connected');
    if(walls.length<3)return null;
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
    if(usable.length<3)return null;
    const first=usable[0],pts=[{...first.start},{...first.end}];
    let currentWall=first,currentJoint=first.endJointId,guard=0;
    while(currentJoint!==first.startJointId&&guard++<usable.length+2){
      const links=(byJoint.get(currentJoint)||[]).filter(e=>e.wall.id!==currentWall.id);
      if(links.length!==1)return null;
      const next=links[0].wall,nextKey=links[0].key,otherKey=nextKey==='start'?'end':'start';
      currentWall=next;currentJoint=next[`${otherKey}JointId`];pts.push({...next[otherKey]});
    }
    if(currentJoint!==first.startJointId)return null;
    pts.pop();return pts.length>=3?pts:null;
  }

  function bounds(project){
    const walls=project?.room?.walls||[];
    if(!walls.length)return{minX:-2000,maxX:2000,minY:-2000,maxY:2000};
    const xs=[],ys=[];for(const w of walls){xs.push(w.start.x,w.end.x);ys.push(w.start.y,w.end.y);}
    return{minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
  }

  function centroid(poly,b){
    if(!poly?.length)return{x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2};
    let a=0,cx=0,cy=0;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const f=poly[j].x*poly[i].y-poly[i].x*poly[j].y;a+=f;cx+=(poly[j].x+poly[i].x)*f;cy+=(poly[j].y+poly[i].y)*f;
    }
    if(Math.abs(a)<1e-6)return{x:poly.reduce((s,p)=>s+p.x,0)/poly.length,y:poly.reduce((s,p)=>s+p.y,0)/poly.length};
    return{x:cx/(3*a),y:cy/(3*a)};
  }

  function setupUI(){
    if($('#walkViewBtn'))return;
    const segmented=$('.segmented');
    if(!segmented)return;
    const btn=document.createElement('button');btn.className='view-btn';btn.id='walkViewBtn';btn.textContent='Walk';segmented.insertBefore(btn,segmented.querySelector('[data-view="render"]'));
    btn.addEventListener('click',enter);
    document.querySelectorAll('.view-btn[data-view]').forEach(b=>b.addEventListener('click',()=>{if(state.active)exit();}));
  }

  function ensureLayer(){
    let canvas=$('#walkCanvas');if(canvas)return canvas;
    const stage=$('.stage');if(!stage)return null;
    canvas=document.createElement('canvas');canvas.id='walkCanvas';canvas.className='walk-canvas';stage.appendChild(canvas);
    const hud=document.createElement('div');hud.id='walkHud';hud.className='walk-hud';hud.innerHTML=`
      <div class="walk-title"><b>Interior Walk</b><span>WASD / arrows move · drag to look · Q/E height</span></div>
      <label>Eye <input id="walkEye" type="number" min="900" max="2200" step="50" value="1650"> mm</label>
      <label>FOV <input id="walkFov" type="number" min="40" max="100" step="1" value="68">°</label>
      <button class="btn ghost" id="walkCenterBtn">Center</button>
      <button class="btn primary" id="walkExitBtn">Exit Walk</button>`;
    stage.appendChild(hud);
    $('#walkExitBtn').onclick=exit;$('#walkCenterBtn').onclick=resetCamera;
    $('#walkEye').onchange=e=>{state.camera.z=clamp(Number(e.target.value)||1650,900,2200);};
    $('#walkFov').onchange=e=>{state.camera.fov=clamp(Number(e.target.value)||68,40,100);};
    canvas.addEventListener('pointerdown',e=>{state.drag=true;state.last={x:e.clientX,y:e.clientY};canvas.setPointerCapture?.(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!state.drag)return;const dx=e.clientX-state.last.x,dy=e.clientY-state.last.y;state.last={x:e.clientX,y:e.clientY};state.camera.yaw+=dx*.0045;state.camera.pitch=clamp(state.camera.pitch-dy*.004,-1.25,1.25);});
    canvas.addEventListener('pointerup',()=>{state.drag=false;});canvas.addEventListener('pointercancel',()=>{state.drag=false;});
    return canvas;
  }

  function resetCamera(){
    const p=projectData();if(!p)return;const b=bounds(p),poly=roomPolygon(p),c=centroid(poly,b);
    state.camera.x=c.x;state.camera.y=c.y;state.camera.z=Number($('#walkEye')?.value)||1650;state.camera.yaw=0;state.camera.pitch=0;
  }

  function enter(){
    const p=projectData();if(!p?.room?.walls?.length){alert('Draw room walls first.');return;}
    const canvas=ensureLayer();if(!canvas)return;state.active=true;resetCamera();
    canvas.style.display='block';$('#walkHud').style.display='flex';$('#workspaceCanvas').style.visibility='hidden';
    document.querySelectorAll('.view-btn').forEach(b=>b.classList.remove('active'));$('#walkViewBtn').classList.add('active');
    const badge=$('#viewBadge');if(badge)badge.textContent='INTERIOR WALK';const hint=$('#stageHint');if(hint)hint.textContent='Walk inside the room. Drag to look around; WASD or arrow keys move.';
    state.lastT=performance.now();cancelAnimationFrame(state.raf);state.raf=requestAnimationFrame(loop);
  }

  function exit(){
    state.active=false;cancelAnimationFrame(state.raf);state.keys.clear();
    const c=$('#walkCanvas'),h=$('#walkHud');if(c)c.style.display='none';if(h)h.style.display='none';$('#workspaceCanvas').style.visibility='visible';
    $('#walkViewBtn')?.classList.remove('active');const b=$('.view-btn[data-view="3d"]');if(b)b.classList.add('active');
    const hint=$('#stageHint');if(hint)hint.textContent='3D is generated directly from the editable project geometry.';const badge=$('#viewBadge');if(badge)badge.textContent='INTERACTIVE 3D';
  }

  function cameraPoint(p){
    const dx=p.x-state.camera.x,dy=p.y-state.camera.y,dz=p.z-state.camera.z;
    const cy=Math.cos(state.camera.yaw),sy=Math.sin(state.camera.yaw);
    const x1=dx*cy-dy*sy,z1=dx*sy+dy*cy;
    const cp=Math.cos(state.camera.pitch),sp=Math.sin(state.camera.pitch);
    return{x:x1,y:dz*cp-z1*sp,z:dz*sp+z1*cp};
  }

  function clipNear(poly,near=20){
    const out=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],ain=a.z>near,bin=b.z>near;
      if(ain)out.push(a);
      if(ain!==bin){const t=(near-a.z)/(b.z-a.z);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:near});}
    }
    return out;
  }

  function projectPoly(poly,w,h){
    const cam=clipNear(poly.map(cameraPoint));if(cam.length<3)return null;
    const focal=(w/2)/Math.tan(state.camera.fov*Math.PI/360);
    return cam.map(p=>({x:w/2+p.x*focal/p.z,y:h/2-p.y*focal/p.z,z:p.z}));
  }

  function face(points,fill,stroke,faces,w,h){
    const pts=projectPoly(points,w,h);if(!pts)return;faces.push({pts,fill,stroke,depth:pts.reduce((s,p)=>s+p.z,0)/pts.length});
  }

  function render(){
    const canvas=$('#walkCanvas');if(!canvas)return;const rect=canvas.parentElement.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);
    if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);canvas.style.width=rect.width+'px';canvas.style.height=rect.height+'px';}
    const c=canvas.getContext('2d'),w=rect.width,h=rect.height;c.setTransform(dpr,0,0,dpr,0,0);
    const sky=c.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#d9ddd6');sky.addColorStop(1,'#ecebe5');c.fillStyle=sky;c.fillRect(0,0,w,h);
    const p=projectData();if(!p)return;const faces=[],walls=p.room?.walls||[],room=roomPolygon(p),floor=p.room?.surfaces?.floor,ceil=p.room?.surfaces?.ceiling;
    const ceilingPoly=Array.isArray(ceil?.polygon)&&ceil.polygon.length>=3?ceil.polygon:room;
    if(room&&floor?.enabled)face(room.map(q=>({x:q.x,y:q.y,z:0})),floor.colour||'#d9d7d0','#aaa79d',faces,w,h);
    if(ceilingPoly&&ceil?.enabled&&ceil?.visible3d)face([...ceilingPoly].reverse().map(q=>({x:q.x,y:q.y,z:p.settings?.ceilingHeight||2600})),ceil.colour||'#f4f1e9','#d0ccc1',faces,w,h);
    for(const wall of walls){
      const dx=wall.end.x-wall.start.x,dy=wall.end.y-wall.start.y,L=Math.hypot(dx,dy)||1,nx=-dy/L*(wall.thickness||100)/2,ny=dx/L*(wall.thickness||100)/2,H=wall.height||p.settings?.ceilingHeight||2600;
      const a={x:wall.start.x+nx,y:wall.start.y+ny},b={x:wall.end.x+nx,y:wall.end.y+ny},d={x:wall.start.x-nx,y:wall.start.y-ny},e={x:wall.end.x-nx,y:wall.end.y-ny};
      face([{...a,z:0},{...b,z:0},{...b,z:H},{...a,z:H}],'#d5d1c7','#b8b4aa',faces,w,h);
      face([{...e,z:0},{...d,z:0},{...d,z:H},{...e,z:H}],'#c9c5bb','#aaa69e',faces,w,h);
      face([{...a,z:H},{...b,z:H},{...e,z:H},{...d,z:H}],'#e9e5dc','#c9c4b9',faces,w,h);
    }
    faces.sort((a,b)=>b.depth-a.depth);
    for(const f of faces){c.beginPath();c.moveTo(f.pts[0].x,f.pts[0].y);for(let i=1;i<f.pts.length;i++)c.lineTo(f.pts[i].x,f.pts[i].y);c.closePath();c.fillStyle=f.fill;c.fill();c.strokeStyle=f.stroke;c.lineWidth=.8;c.stroke();}
    for(const l of p.room?.lighting||[]){if(!l.enabled)continue;const z=Math.max(0,(p.settings?.ceilingHeight||2600)-(l.drop||0)),q=cameraPoint({x:l.x,y:l.y,z});if(q.z<=20)continue;const focal=(w/2)/Math.tan(state.camera.fov*Math.PI/360),sx=w/2+q.x*focal/q.z,sy=h/2-q.y*focal/q.z,r=clamp((l.diameter||100)*focal/q.z*.12,3,18);c.beginPath();c.arc(sx,sy,r,0,Math.PI*2);c.fillStyle='#e6cf8d';c.fill();}
    c.fillStyle='rgba(255,255,255,.78)';c.fillRect(14,14,170,28);c.fillStyle='#4d554d';c.font='11px Inter, sans-serif';c.fillText(`Eye ${Math.round(state.camera.z)} mm · FOV ${Math.round(state.camera.fov)}°`,24,32);
    c.strokeStyle='rgba(45,50,45,.45)';c.lineWidth=1;c.beginPath();c.moveTo(w/2-7,h/2);c.lineTo(w/2+7,h/2);c.moveTo(w/2,h/2-7);c.lineTo(w/2,h/2+7);c.stroke();
  }

  function update(dt){
    const speed=(state.keys.has('shift')?1600:850)*dt,turn=1.5*dt;
    if(state.keys.has('arrowleft'))state.camera.yaw-=turn;if(state.keys.has('arrowright'))state.camera.yaw+=turn;
    if(state.keys.has('arrowup'))move(0,speed);if(state.keys.has('arrowdown'))move(0,-speed);
    if(state.keys.has('w'))move(0,speed);if(state.keys.has('s'))move(0,-speed);if(state.keys.has('a'))move(-speed,0);if(state.keys.has('d'))move(speed,0);
    if(state.keys.has('q'))state.camera.z=clamp(state.camera.z-speed*.7,500,3000);if(state.keys.has('e'))state.camera.z=clamp(state.camera.z+speed*.7,500,3000);
    const eye=$('#walkEye');if(eye)eye.value=Math.round(state.camera.z);
  }
  function move(side,forward){const y=state.camera.yaw;state.camera.x+=Math.cos(y)*side+Math.sin(y)*forward;state.camera.y+=-Math.sin(y)*side+Math.cos(y)*forward;}
  function loop(t){if(!state.active)return;const dt=Math.min(.04,(t-state.lastT)/1000||0);state.lastT=t;update(dt);render();state.raf=requestAnimationFrame(loop);}

  window.addEventListener('keydown',e=>{if(!state.active)return;const k=e.key.toLowerCase();if(['w','a','s','d','q','e','shift','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){e.preventDefault();state.keys.add(k);}if(k==='escape')exit();});
  window.addEventListener('keyup',e=>{state.keys.delete(e.key.toLowerCase());});
  window.addEventListener('blur',()=>state.keys.clear());
  setupUI();
})();