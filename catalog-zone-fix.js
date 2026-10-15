(()=>{
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const upperIds=new Set(['upper-door','upper-horizontal']);
  let zone='bottom';

  function ensureStyles(){
    if($('#catalogZoneFixStyle'))return;
    const s=document.createElement('style');s.id='catalogZoneFixStyle';s.textContent=`
      #catalogZoneTabsFixed{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0}
      #catalogZoneTabsFixed button{height:30px;border:1px solid #ddd8cd;border-radius:9px;background:#fff;color:#4f564d;font:10px Inter,sans-serif;cursor:pointer}
      #catalogZoneTabsFixed button.active{background:#dde8d9;border-color:#b9ccb3;color:#30442d}
    `;document.head.appendChild(s);
  }

  function ensureTabs(){
    const search=$('#catalogSearch');if(!search)return null;
    $('#cabinetZoneTabs')?.remove();
    let wrap=$('#catalogZoneTabsFixed');
    if(!wrap){
      wrap=document.createElement('div');wrap.id='catalogZoneTabsFixed';
      wrap.innerHTML='<button type="button" data-zone="bottom" class="active">Bottom</button><button type="button" data-zone="upper">Upper</button>';
      search.parentNode.insertBefore(wrap,search);
      wrap.addEventListener('click',e=>{const b=e.target.closest('[data-zone]');if(!b)return;e.preventDefault();e.stopPropagation();zone=b.dataset.zone;apply();});
    }
    return wrap;
  }

  function cabinetTabActive(){return !!$('.catalog-tab[data-cat="cabinets"].active');}

  function apply(){
    ensureStyles();const wrap=ensureTabs();if(!wrap)return;
    const active=cabinetTabActive();wrap.style.display=active?'grid':'none';
    $$('#catalogZoneTabsFixed [data-zone]').forEach(b=>b.classList.toggle('active',b.dataset.zone===zone));
    if(!active)return;
    $$('#catalogList .catalog-card[data-cat="cabinets"]').forEach(card=>{
      const isUpper=upperIds.has(card.dataset.id);
      card.style.display=(zone==='upper'?isUpper:!isUpper)?'':'none';
    });
  }

  window.addEventListener('load',()=>{
    const list=$('#catalogList');
    if(list)new MutationObserver(()=>requestAnimationFrame(apply)).observe(list,{childList:true,subtree:true});
    document.addEventListener('click',e=>{if(e.target.closest?.('.catalog-tab[data-cat]'))setTimeout(apply,0);});
    $('#catalogSearch')?.addEventListener('input',()=>setTimeout(apply,0));
    setTimeout(apply,0);
  },{once:true});
})();
