// Local illustrative visitor; time advances only with the shared market clock.
export type Visitor = {target:1|3;x:number;z:number;phase:"travel"|"wait"|"approach"|"observe"|"collect"|"exit";elapsed:number;carrying:boolean;heading:number};
export const createVisitor=():Visitor=>({target:1,x:3.65,z:3.4,phase:"travel",elapsed:0,carrying:false,heading:Math.PI});
export function advanceVisitor(previous:Visitor,delta:number,selected:number,storyTime:number):Visitor{
 const state={...previous};if(delta<=0)return state;
 const destinationZ=state.target===1?-.48:2.77;
 const occupied=selected===state.target&&storyTime<11;
 // Yield via the outer approach lane; the main agent uses the centre of the counter.
 if(occupied&&(state.phase==="approach"||state.phase==="observe"||state.phase==="collect")){state.phase="exit";state.elapsed=0;}
 const move=(x:number,z:number)=>{const dx=x-state.x,dz=z-state.z,distance=Math.hypot(dx,dz);state.heading=Math.atan2(dx,dz);const step=Math.min(distance,delta*1.15);if(distance){state.x+=dx/distance*step;state.z+=dz/distance*step;}return distance<=step;};
 if(state.phase==="travel"){if(move(3.65,destinationZ))state.phase="wait";}
 else if(state.phase==="wait"){if(!occupied){state.phase="approach";state.carrying=false;}}
 else if(state.phase==="approach"){if(move(2.8,destinationZ)){state.phase="observe";state.elapsed=0;state.heading=Math.PI;}}
 else if(state.phase==="observe"){state.elapsed+=delta;if(state.elapsed>=2){state.phase="collect";state.elapsed=0;}}
 else if(state.phase==="collect"){state.elapsed+=delta;if(state.elapsed>=.8){state.carrying=true;state.phase="exit";state.elapsed=0;}}
 else if(state.phase==="exit"){if(move(3.65,destinationZ)){if(occupied&&!state.carrying)state.phase="wait";else{state.target=state.target===1?3:1;state.phase="travel";}}}
 return state;
}
