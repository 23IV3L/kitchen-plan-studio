(()=>{
  const $=s=>document.querySelector(s);

  function status(text){
    const el=$('#statusMessage');
    if(el) el.textContent=text;
  }

  function badge(){
    let el=$('#applianceHostBadge');
    if(!el){
      el=document.createElement('div');
      el.id='applianceHostBadge';
      el.style.cssText='position:absolute;left:14px;top:58px;z-index:20;background:rgba(41,52,39,.94);color:#fff;border-radius:9px;padding:8px 10px;font:10px Inter,sans-serif;display:none;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.10)';
      $('.stage')?.appendChild(el);
    }
    return el;
  }

  function showHostMode(text='Select a compatible cabinet in the 2D plan'){
    const b=badge();
    b.textContent=text;
    b.style.display='block';
    status(text+'.');
  }

  function hideHostMode(){
    const b=$('#applianceHostBadge');
    if(b) b.style.display='none';
  }

  function moveToPlanForHostSelection(){
    const planBtn=$('.view-btn[data-view="plan"]');
    if(planBtn && !planBtn.classList.contains('active')) planBtn.click();
    requestAnimationFrame(()=>showHostMode());
  }

  document.addEventListener('click',e=>{
    if(e.target.closest?.('#appChooseHost')){
      // appliance-engine arms host selection first; then we move the user to the view
      // where cabinet hit-testing is currently reliable.
      setTimeout(moveToPlanForHostSelection,0);
      return;
    }
    if(e.target.closest?.('#appChangeHost')){
      setTimeout(()=>{
        const planBtn=$('.view-btn[data-view="plan"]');
        if(planBtn && !planBtn.classList.contains('active')) planBtn.click();
        showHostMode('Select the new compatible host cabinet in the 2D plan');
      },0);
      return;
    }
    if(e.target.closest?.('#appDraftCancel')||e.target.closest?.('#appDelete')) hideHostMode();
  });

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') hideHostMode();
  });

  const props=$('#propertiesPanel');
  if(props){
    new MutationObserver(()=>{
      const insert=$('#appChooseHost');
      if(insert) insert.textContent='Choose host cabinet';
      const change=$('#appChangeHost');
      if(change) change.textContent='Choose different host cabinet';
    }).observe(props,{childList:true,subtree:true});
  }
})();
