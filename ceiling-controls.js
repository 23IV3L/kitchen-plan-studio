(()=>{
  const canvas=document.getElementById('workspaceCanvas');
  const ceilingBtn=document.getElementById('ceilingSurfaceBtn');
  const stage=document.querySelector('.stage');
  if(!canvas||!ceilingBtn||!stage)return;

  let points=[];

  const controls=document.createElement('div');
  controls.id='ceilingDrawControls';
  controls.style.cssText='position:absolute;top:54px;right:16px;z-index:20;display:none;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(73,78,70,.16);border-radius:12px;background:rgba(255,255,255,.94);box-shadow:0 8px 24px rgba(40,45,38,.10);font:11px Inter,Arial,sans-serif;color:#596057;';
  controls.innerHTML='<span id="ceilingPointCount">0 points</span><button id="finishCeilingDraw" type="button" style="border:0;border-radius:8px;padding:7px 10px;background:#405b3d;color:white;cursor:pointer;font:600 11px Inter,Arial,sans-serif">Finish ceiling</button><button id="cancelCeilingDraw" type="button" style="border:1px solid #d8d7d0;border-radius:8px;padding:6px 9px;background:#fff;color:#5d625b;cursor:pointer;font:11px Inter,Arial,sans-serif">Cancel</button>';
  stage.appendChild(controls);

  const count=controls.querySelector('#ceilingPointCount');
  const finishBtn=controls.querySelector('#finishCeilingDraw');
  const cancelBtn=controls.querySelector('#cancelCeilingDraw');

  function isActive(){return ceilingBtn.classList.contains('active');}
  function refresh(){
    const active=isActive();
    controls.style.display=active?'flex':'none';
    count.textContent=`${points.length} point${points.length===1?'':'s'}`;
    finishBtn.style.opacity=points.length>=3?'1':'.45';
    finishBtn.disabled=points.length<3;
  }
  function finish(){
    if(!isActive()||points.length<3)return;
    const r=canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,clientX:r.left+(points.at(-1)?.x||0),clientY:r.top+(points.at(-1)?.y||0)}));
    points=[];
    setTimeout(refresh,0);
  }
  function cancel(){
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    points=[];
    setTimeout(refresh,0);
  }

  ceilingBtn.addEventListener('click',()=>{points=[];setTimeout(refresh,0);},true);
  finishBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();finish();});
  cancelBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();cancel();});

  canvas.addEventListener('pointerdown',e=>{
    if(!isActive())return;
    const r=canvas.getBoundingClientRect();
    const p={x:e.clientX-r.left,y:e.clientY-r.top};

    // Closing the polygon should be easy and screen-based: click the first point again.
    if(points.length>=3 && Math.hypot(p.x-points[0].x,p.y-points[0].y)<=18){
      e.preventDefault();
      e.stopImmediatePropagation();
      finish();
      return;
    }

    points.push(p);
    refresh();
  },true);

  canvas.addEventListener('dblclick',()=>{if(isActive()){points=[];setTimeout(refresh,0);}},true);
  canvas.addEventListener('contextmenu',e=>{
    if(!isActive()||points.length<3)return;
    e.preventDefault();
    finish();
  },true);

  window.addEventListener('keydown',e=>{
    if(!isActive())return;
    if(e.key==='Enter'&&points.length>=3){e.preventDefault();finish();}
    if(e.key==='Escape'){points=[];setTimeout(refresh,0);}
  },true);

  new MutationObserver(()=>{
    if(!isActive())points=[];
    refresh();
  }).observe(ceilingBtn,{attributes:true,attributeFilter:['class']});

  refresh();
})();
