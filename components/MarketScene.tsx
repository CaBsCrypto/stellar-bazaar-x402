"use client";
import {useEffect,useRef} from "react";
import * as T from "three";
import {advanceVisitor,createVisitor} from "@/lib/market-visitor";
import {marketStalls} from "@/lib/market-stalls";
import {reviewFilePaths} from "@/lib/review-deliveries";
type Props={selected:number;elapsed:number;ambient:number;active:boolean;reduced:boolean;onReady:(ready:boolean)=>void};
export default function MarketScene(props:Props){
 const host=useRef<HTMLDivElement>(null),latest=useRef(props),wake=useRef(()=>{});
 latest.current=props;
 useEffect(()=>{wake.current();},[props.active,props.reduced,props.selected,props.elapsed]);
 useEffect(()=>{
  const element=host.current!;if(!element)return;
  let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({alpha:true,antialias:true});}catch{latest.current.onReady(false);return;}
  renderer.setClearColor(0,0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;
  element.appendChild(renderer.domElement);
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-5,5,4,-4,.1,100);
  scene.add(new T.HemisphereLight(0xffffff,0xb7a6a0,2.4));
  const sun=new T.DirectionalLight(0xfff2dc,3.2);sun.position.set(-4,9,7);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-6,right:6,top:6,bottom:-6});sun.shadow.normalBias=.035;scene.add(sun);
  const resources:T.Texture[]=[];
  const mat=(color:string)=>new T.MeshStandardMaterial({color,roughness:.8});
  function box(parent:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,color:string){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  function sphere(parent:T.Object3D,r:number,x:number,y:number,z:number,color:string){const mesh=new T.Mesh(new T.SphereGeometry(r,16,12),mat(color));mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;}
  const platform=box(scene,8,.22,8.5,0,-.2,1,"#eee7da");
  const platformTop=box(scene,7.9,.05,8.4,0,-.065,1,"#faf6ed");
  const positions=[[-2,-1.65],[2,-1.65],[-2,1.6],[2,1.6]];
  const booths=positions.map(([x,z],index)=>{
   const group=new T.Group();group.position.set(x,0,z);scene.add(group);const color=marketStalls[index].color;
   box(group,2.35,.12,1.7,0,.06,0,"#e2d9cb");
   box(group,2.05,.68,.55,0,.49,.5,"#fffaf0");box(group,2.24,.09,.76,0,.87,.48,"#fffdf7");
   box(group,1.9,.75,.08,0,1.25,-.59,"#f6f0e5");
   for(const px of [-.99,.99])for(const pz of [-.6,.58])box(group,.07,1.9,.07,px,1,pz,"#e5d9c8");
   for(let stripe=0;stripe<8;stripe++){const roof=box(group,.285,.09,1.75,-1+.285*stripe,2.05,0,stripe%2?"#fff4e7":color);roof.rotation.x=.1;box(group,.285,.23,.09,-1+.285*stripe,1.9,.86,stripe%2?"#fff4e7":color);}
   const glow=box(group,2.4,.035,1.76,0,.145,0,color);
   const samples=new T.Group();samples.position.z=.42;group.add(samples);
   if(index===0){for(let i=0;i<3;i++){box(samples,.44,.64,.045,-.59+i*.59,1.26,.1,"#ffffff");for(let j=0;j<3;j++)box(samples,.3,.025,.01,-.59+i*.59,1.39-j*.12,.13,color);}}
   if(index===1){box(samples,1.35,.82,.05,0,1.35,.1,"#ffffff");for(let i=0;i<4;i++)box(samples,.17,.15+i*.11,.02,-.43+i*.28,1.13+i*.055,.14,color);}
   if(index===2){for(const [i,key] of ["poster-a","poster-b"].entries()){const texture=new T.TextureLoader().load(reviewFilePaths[key],()=>wake.current());texture.colorSpace=T.SRGBColorSpace;resources.push(texture);const mesh=new T.Mesh(new T.PlaneGeometry(.6,.87),new T.MeshStandardMaterial({map:texture,side:T.DoubleSide}));mesh.position.set(i*.78-.39,1.35,.16);samples.add(mesh);}}
   if(index===3){box(samples,1.48,.8,.08,0,1.37,.08,"#282438");const shape=new T.Shape();shape.moveTo(-.14,-.2);shape.lineTo(.2,0);shape.lineTo(-.14,.2);shape.closePath();const play=new T.Mesh(new T.ShapeGeometry(shape),mat(color));play.position.set(0,1.37,.13);samples.add(play);}
   return {group,glow,samples};
  });
  function character(robot:boolean,color:string){const group=new T.Group();const legs=[box(group,.11,.28,.13,-.1,.2,0,"#51445f"),box(group,.11,.28,.13,.1,.2,0,"#51445f")];box(group,.34,.35,.23,0,.5,0,color);if(robot){box(group,.43,.31,.3,0,.84,0,color);box(group,.3,.11,.02,0,.86,.16,"#403351");sphere(group,.025,-.085,.86,.18,"#9cf0d1");sphere(group,.025,.085,.86,.18,"#9cf0d1");box(group,.025,.13,.025,0,1.04,0,"#776399");sphere(group,.047,0,1.12,0,color);}else{sphere(group,.17,0,.85,0,"#c99476");sphere(group,.175,0,.92,-.035,"#514039");}const arms=[box(group,.09,.29,.12,-.23,.48,0,color),box(group,.09,.29,.12,.23,.48,0,color)];scene.add(group);return{group,legs,arms};}
  const robot=character(true,"#9c80dc"),visitor=character(true,"#97c8af"),human=character(false,"#8aa995");
  // Desk sits in front of the stalls, away from the central pedestrian aisle.
  const desk=new T.Group();scene.add(desk);
  box(desk,1.65,.1,.85,0,.75,0,"#dbc4a5");
  for(const x of [-.68,.68])for(const z of [-.3,.3])box(desk,.08,.7,.08,x,.35,z,"#aa8e70");
  box(desk,1.08,.68,.075,0,1.19,-.1,"#4d425f");
  box(desk,.99,.59,.02,0,1.19,-.052,"#f2ecff");
  box(desk,.06,.18,.07,0,.82,-.1,"#766485");box(desk,.4,.035,.25,0,.8,-.1,"#766485");
  box(desk,.63,.03,.2,0,.82,.23,"#f4eef6");
  const screenSamples=booths.map(({samples})=>{const wrapper=new T.Group();const miniature=samples.clone(true);miniature.position.set(0,-1.3,0);wrapper.add(miniature);wrapper.scale.setScalar(.62);wrapper.position.set(0,1.22,0);desk.add(wrapper);return wrapper;});
  const requestDots=new T.Group();desk.add(requestDots);for(let i=0;i<3;i++)sphere(requestDots,.035,-.18+i*.18,1.2,.025,"#a48acb");
  // The seated person faces the monitor; legs and chair keep the pose recognizable.
  const chair=new T.Group();scene.add(chair);box(chair,.5,.08,.46,0,.36,0,"#80679e");box(chair,.5,.48,.07,0,.61,.21,"#a58abf");for(const x of [-.18,.18])box(chair,.05,.34,.05,x,.17,.13,"#655574");
  human.legs.forEach(leg=>{leg.rotation.x=-Math.PI/2;leg.position.y=.3;leg.position.z=.12;});
  const parcel=new T.Group();scene.add(parcel);const parcelCard=box(parcel,.36,.45,.055,0,0,0,"#b29af3");box(parcel,.24,.035,.01,0,.09,.035,"#ffffff");box(parcel,.24,.035,.01,0,-.01,.035,"#ffffff");
  const visitorParcel=parcel.clone(true);scene.add(visitorParcel);visitorParcel.traverse(object=>{if(object instanceof T.Mesh){object.material=(object.material as T.MeshStandardMaterial).clone();}});(visitorParcel.children[0] as T.Mesh<T.BoxGeometry,T.MeshStandardMaterial>).material.color.set("#97c8af");
  let visitorState=createVisitor(),lastAmbient=props.ambient;
  let frame=0,disposed=false,lost=false,mobile=false;
  function resize(){const width=element.clientWidth,height=element.clientHeight;mobile=window.innerWidth<700;renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.5:2));renderer.setSize(width,height);const span=mobile?Math.max(6.1,4.4*width/height):6.1;camera.left=-span;camera.right=span;camera.top=span*height/width;camera.bottom=-camera.top;camera.position.set(8,8,10);camera.lookAt(0,.65,1);camera.updateProjectionMatrix();wake.current();}
  // Distance-weighted interpolation keeps walking speed constant through the aisle.
  function walk(points:T.Vector3[],progress:number){const lengths=points.slice(1).map((point,i)=>point.distanceTo(points[i]));let distance=lengths.reduce((sum,value)=>sum+value,0)*Math.max(0,Math.min(1,progress));for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]||i===lengths.length-1){const direction=points[i+1].clone().sub(points[i]);return{position:points[i].clone().lerp(points[i+1],lengths[i]?distance/lengths[i]:0),heading:Math.atan2(direction.x,direction.z)};}distance-=lengths[i];}return{position:points[0],heading:0};}
  function draw(){frame=0;if(disposed||lost)return;const p=latest.current,t=p.elapsed,collect=t>=6&&t<8,result=t>=11,walking=t>=3&&t<6||t>=8&&t<11;
   const stallX=positions[p.selected][0],stallZ=positions[p.selected][1];
   booths.forEach(({group,glow},i)=>{group.visible=true;group.position.set(positions[i][0],0,positions[i][1]);glow.visible=i===p.selected;glow.material.opacity=collect?.7+.3*Math.sin((t-6)*Math.PI):1;glow.material.transparent=true;});

   desk.position.set(-1.15,0,3.95);
   human.group.position.set(desk.position.x,.06,desk.position.z+.6);human.group.rotation.y=Math.PI;chair.position.set(desk.position.x,0,desk.position.z+.63);
   human.arms.forEach((arm,i)=>arm.rotation.x=-.85+(result&&!p.reduced?Math.sin(Math.min(1,(t-11)/1.2)*Math.PI)*.4:0));
   screenSamples.forEach((sample,i)=>sample.visible=result&&i===p.selected);requestDots.visible=!result;
   const origin=new T.Vector3(.3,0,3.95),destination=new T.Vector3(stallX,0,stallZ+1.17);
   const route=[origin,new T.Vector3(0,0,3.12),new T.Vector3(0,0,stallZ+1.17),destination];
   const fraction=t<3?0:t<6?(t-3)/3:t<8?1:t<11?1-(t-8)/3:0;
   const pose=walk(route,fraction);robot.group.position.copy(pose.position);robot.group.rotation.y=walking?pose.heading+(t>=8?Math.PI:0):result||t<3?-Math.PI/2:Math.PI;
   robot.legs.forEach((leg,i)=>leg.rotation.x=walking&&!p.reduced?Math.sin(t*10+i*Math.PI)*.4:0);
   robot.arms.forEach((arm,i)=>arm.rotation.x=walking&&!p.reduced?Math.sin(t*10+i*Math.PI)*-.3:collect?-.6:0);
   parcel.visible=t>=6&&t<11.5;parcelCard.material.color.set(marketStalls[p.selected].color);
   const carry=robot.group.position.clone().add(new T.Vector3(0,.67,.23));
   if(collect){const from=new T.Vector3(stallX,1.2,stallZ+.8);parcel.position.lerpVectors(from,carry,Math.min(1,(t-6)/1.2));}
   else if(result){parcel.position.lerpVectors(carry,new T.Vector3(desk.position.x,1.2,desk.position.z),Math.min(1,(t-11)/.5));}
   else parcel.position.copy(carry);
   const delta=Math.max(0,p.ambient-lastAmbient);lastAmbient=p.ambient;
   if(!p.reduced)visitorState=advanceVisitor(visitorState,delta,p.selected,t);
   visitor.group.visible=true;visitor.group.position.set(visitorState.x,0,visitorState.z);visitor.group.rotation.y=visitorState.heading;
   const visitorWalking=["travel","approach","exit"].includes(visitorState.phase);
   visitor.legs.forEach((leg,i)=>leg.rotation.x=!p.reduced&&visitorWalking?Math.sin(p.ambient*9+i*Math.PI)*.35:0);
   visitor.arms.forEach((arm,i)=>arm.rotation.x=!p.reduced&&visitorWalking?Math.sin(p.ambient*9+i*Math.PI)*-.25:visitorState.phase==="collect"?-.6:0);
   visitorParcel.visible=(visitorState.carrying||visitorState.phase==="collect");
   const visitorCarry=new T.Vector3(visitorState.x,.67,visitorState.z+.23);
   if(visitorState.phase==="collect")visitorParcel.position.lerpVectors(new T.Vector3(2.8,1.2,visitorState.z-.37),visitorCarry,Math.min(1,visitorState.elapsed/.8));else visitorParcel.position.copy(visitorCarry);
   renderer.render(scene,camera);
   const buttons=element.parentElement?.querySelectorAll<HTMLElement>(".market-booth");
   const anchors=positions.map(([x,z])=>new T.Vector3(x,2.5,z).project(camera));
   const middleY=((1-anchors[1].y)+(1-anchors[2].y))*element.clientHeight/4;
   buttons?.forEach((button,i)=>{const point=anchors[i];const halfWidth=button.offsetWidth/2;const x=mobile?Math.max(halfWidth+4,Math.min(element.clientWidth-halfWidth-4,(point.x+1)*element.clientWidth/2)):(point.x+1)*element.clientWidth/2;const y=mobile?middleY+(i===0?-52:i===3?52:0):(1-point.y)*element.clientHeight/2;button.style.setProperty("--label-x",`${x}px`);button.style.setProperty("--label-y",`${y}px`);});
  }
  // Render on shared-clock updates only: there is no independent animation loop.
  wake.current=()=>{if(!disposed&&!lost&&!frame)frame=requestAnimationFrame(draw);};
  const observer=new ResizeObserver(resize);observer.observe(element);resize();latest.current.onReady(true);
  const loss=(event:Event)=>{event.preventDefault();lost=true;cancelAnimationFrame(frame);frame=0;latest.current.onReady(false);};const restore=()=>{lost=false;latest.current.onReady(true);wake.current();};renderer.domElement.addEventListener("webglcontextlost",loss);renderer.domElement.addEventListener("webglcontextrestored",restore);
  return()=>{disposed=true;wake.current=()=>{};cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener("webglcontextlost",loss);renderer.domElement.removeEventListener("webglcontextrestored",restore);scene.traverse(object=>{if(object instanceof T.Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>material.dispose());}});resources.forEach(texture=>texture.dispose());renderer.dispose();renderer.domElement.remove();};
 },[]);
 return <div className="market-three" ref={host} aria-hidden="true"/>;
}
