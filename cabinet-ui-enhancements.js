(()=>{
  const STORAGE_KEY='kitchen-studio-project-v2';
  const PRESETS={
    'base-door':{name:'Base · 1 door',kind:'base',zone:'bottom',depth:560,height:720,bottom:100,frontType:'door1',frontCount:1},
    'base-double':{name:'Base · 2 doors',kind:'base',zone:'bottom',depth:560,height:720,bottom:100,frontType:'door2',frontCount:2},
    'base-drawers':{name:'Base · drawers',kind:'base',zone:'bottom',depth:560,height:720,bottom:100,frontType:'drawers',frontCount:3},
    'tall-pantry':{name:'Tall · pantry',kind:'tall',zone:'bottom',depth:600,height:2400,bottom:0,frontType:'door1',frontCount:1},
    'tall-oven':{name:'Tall · oven',kind:'tall',zone:'bottom',depth:600,height:2400,bottom:0,frontType:'mixed',frontCount:3},
    'corner':{name:'Corner',kind:'corner',zone:'bottom',depth:900,height:720,bottom:100,frontType:'corner',frontCount:1},
    'upper-door':{name:'Upper · door',kind:'upper',zone:'upper',depth:350,height:720,bottom:1500,frontType:'door1',frontCount:1},
    'upper-horizontal':{name:'Upper · horizontal',kind:'upper',zone:'upper',depth:350,height:720,bottom:1500,frontType:'horizontal',frontCount:1}
  };
  const $=s=>document.querySelector(s);
  const read=()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch{return null;}};
  const write=p=>{p.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(p));window.dispatchEvent(new Event('resize'));};

  function organizeCatalog(){
    const list=$('#catalogList');
    if(!list||!document.querySelector('.catalog-tab.active[data-cat="cabinets"]'))return;
    if(list.dataset.grouped==='1'&&list.querySelector('.cabinet-catalog-group'))return;
    const cards=[...list.querySelectorAll('.catalog-card[data-cat="cabinets"]')];
    if(!cards.length)return;
    const bottom=[],upper=[];
    for(const c of cards){const p=PRESETS[c.dataset.id];(p?.zone==='upper'?upper:bottom).push(c);}
    list.innerHTML='';
    const make=(title,items,cls)=>{
      if(!items.length)return;
      const wrap=document.createElement('div');wrap.className=`cabinet-catalog-group ${cls}`;
      const h=document.createElement('div');h.className='cabinet-catalog-heading';h.textContent=title;wrap.appendChild(h);
      items.forEach(c=>wrap.appendChild(c));list.appendChild(wrap);
    };
    make('Bottom cabinets',bottom,'bottom');
    make('Upper cabinets',upper,'upper');
    list.dataset.grouped='1';
  }

  function currentCabinetFromPanel(){
    if($('#propertyContext')?.textContent!=='Cabinet')return null;
    const p=read();if(!p)return null;
    const width=Number($('#cabWidth')?.value),depth=Number($('#cabDepth')?.value),height=Number($('#cabHeight')?.value),bottom=Number($('#cabBottom')?.value),offset=Number($('#cabOffset')?.value);
    const title=$('#propertiesPanel .prop-card h4')?.textContent?.trim();
    const arr=p.kitchen?.objects||[];
    const scored=arr.map(o=>({o,score:(Number.isFinite(width)?Math.abs(o.width-width):0)+(Number.isFinite(depth)?Math.abs(o.depth-depth):0)+(Number.isFinite(height)?Math.abs(o.height-height):0)+(Number.isFinite(bottom)?Math.abs((o.bottom||0)-bottom):0)+(Number.isFinite(offset)?Math.abs((o.offset||0)-offset):0)+(title&&o.name!==title?10000:0)})).sort((a,b)=>a.score-b.score);
    return scored[0]?.score<2?scored[0].o:null;
  }

  function enhanceProperties(){
    const panel=$('#propertiesPanel');
    if(!panel||$('#propertyContext')?.textContent!=='Cabinet'||panel.querySelector('#cabinetTypeSelect'))return;
    const cab=currentCabinetFromPanel();if(!cab)return;
    const current=PRESETS[cab.typeId]||Object.values(PRESETS).find(x=>x.name===cab.name);
    const zone=current?.zone||(cab.kind==='upper'?'upper':'bottom');
    const firstCard=panel.querySelector('.prop-card');if(!firstCard)return;
    const row=document.createElement('div');row.className='cabinet-type-row';
    const opts=Object.entries(PRESETS).filter(([,v])=>v.zone===zone).map(([id,v])=>`<option value="${id}" ${id===cab.typeId?'selected':''}>${v.name}</option>`).join('');
    row.innerHTML=`<div class="prop-row" style="margin-top:0"><span>Cabinet type <span class="cabinet-zone-badge">${zone}</span></span><select class="prop-input" id="cabinetTypeSelect">${opts}</select></div><div class="cabinet-type-note">Changes the cabinet type while keeping its current width and wall position.</div>`;
    firstCard.insertBefore(row,firstCard.children[1]||null);
    $('#cabinetTypeSelect').onchange=e=>{
      const p=read(),target=p?.kitchen?.objects?.find(o=>o.id===cab.id),preset=PRESETS[e.target.value];if(!p||!target||!preset)return;
      target.typeId=e.target.value;target.name=preset.name;target.kind=preset.kind;target.frontType=preset.frontType;target.frontCount=preset.frontCount;
      target.depth=preset.depth;target.height=preset.height;target.bottom=preset.bottom;
      write(p);
      const msg=$('#statusMessage');if(msg)msg.textContent=`Changed to ${preset.name}. Width and wall position preserved.`;
      setTimeout(()=>{const w=$('#cabWidth');if(w)w.dispatchEvent(new Event('change',{bubbles:true}));},0);
    };
  }

  function refresh(){organizeCatalog();enhanceProperties();}
  const observer=new MutationObserver(()=>requestAnimationFrame(refresh));
  window.addEventListener('load',()=>{
    const list=$('#catalogList'),props=$('#propertiesPanel');
    if(list)observer.observe(list,{childList:true,subtree:true});
    if(props)observer.observe(props,{childList:true,subtree:true});
    document.querySelectorAll('.catalog-tab').forEach(b=>b.addEventListener('click',()=>{const list=$('#catalogList');if(list)delete list.dataset.grouped;setTimeout(refresh,0);}));
    $('#catalogSearch')?.addEventListener('input',()=>{const list=$('#catalogList');if(list)delete list.dataset.grouped;setTimeout(refresh,0);});
    refresh();
  },{once:true});
})();
