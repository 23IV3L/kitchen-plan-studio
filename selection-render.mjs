import {StudioRenderer} from './render.mjs';

if(!StudioRenderer.prototype.__multiWallSelectionPatched){
  StudioRenderer.prototype.__multiWallSelectionPatched=true;
  const original=StudioRenderer.prototype.drawWallPlan;
  StudioRenderer.prototype.drawWallPlan=function(wall,project){
    const multi=window.__ksMultiSelection;
    const isMulti=multi?.category==='walls'&&Array.isArray(multi.ids)&&multi.ids.includes(wall.id);
    if(!isMulti)return original.call(this,wall,project);
    const previous=this.selectedId;
    this.selectedId=wall.id;
    try{return original.call(this,wall,project);}finally{this.selectedId=previous;}
  };
}
