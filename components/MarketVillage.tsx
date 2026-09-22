"use client";
import {useEffect,useId,useRef,useState,type ReactNode,type CSSProperties} from "react";
import dynamic from "next/dynamic";
const MarketScene = dynamic(()=>import("./MarketScene"),{ssr:false});
import {marketStalls} from "@/lib/market-stalls";
import {getService} from "@/lib/catalog";
import {reviewDeliveries,reviewFilePaths} from "@/lib/review-deliveries";
import {Button,ButtonLink} from "./ui";
import {Modal} from "./ui/Modal";
function Booth({index}:{index:number}){
 const stall=marketStalls[index], uid=useId().replace(/:/g,"");
 return <svg viewBox="0 0 240 220" aria-hidden="true" focusable="false"><defs><linearGradient id={uid+"roof"} x2="0.5" y2="1"><stop stopColor={stall.color}/><stop offset="1" stopColor={stall.dark}/></linearGradient><linearGradient id={uid+"base"} x2="0" y2="1"><stop stopColor="#fffefa"/><stop offset="1" stopColor="#e3dfd6"/></linearGradient></defs>
 <ellipse cx="125" cy="198" rx="99" ry="17" fill="#292039" opacity=".09"/>
 <path d="M25 165 166 155 216 179 72 197Z" fill="#faf8f2"/><path d="M25 165 72 185 72 209 25 187Z" fill="#d8d3c9"/><path d="M72 185 216 165 216 189 72 209Z" fill={"url(#"+uid+"base)"}/>
 <path d="M49 73v96M183 57v107" stroke="#d4cfc5" strokeWidth="7"/><path d="M58 72v90M192 62v98" stroke="#fffefa" strokeWidth="7"/>
 <path d="M59 97 182 79 182 153 59 173Z" fill="#f2eee6" stroke="#e3ddd2"/>
 <g className="market-sample-art">
 {index===0?<><path d="M77 110 102 106 102 151 77 155Z M110 105 135 101 135 146 110 150Z M143 100 168 96 168 141 143 145Z" fill="#fffefa" stroke="#d8ccef"/><path d="m82 123 14-2m-14 10 14-2m19-13 14-2m-14 10 14-2m19-13 14-2m-14 10 14-2" stroke={stall.dark} strokeWidth="3"/></>:index===1?<><path d="M76 108 165 95 165 151 76 164Z" fill="#fffefa"/><path d="m89 146v-14m17 11v-26m17 23v-19m17 16v-34" stroke={stall.dark} strokeWidth="8"/><path d="m85 118 63-9" stroke="#ccc7bc" strokeWidth="3"/></>:index===2?<><image href={reviewFilePaths["poster-a"]} x="74" y="96" width="44" height="67" transform="rotate(-7 96 130)"/><image href={reviewFilePaths["poster-b"]} x="128" y="89" width="44" height="67" transform="rotate(-7 150 120)"/></>:<><path d="M74 109 170 94 170 155 74 170Z" fill="#252032" stroke="#504967" strokeWidth="4"/><path d="m115 118 23 10-23 17Z" fill={stall.color}/><path d="m82 158 77-12" stroke="#a9bdeb" strokeWidth="2"/></>}
 </g>
 <path d="M39 162 183 141 214 156 72 178Z" fill="#fffefa" stroke="#e0d9cc"/><path d="M72 178 214 156v8L72 186Z" fill="#cfc8ba"/>
 <path d="M25 52 168 31 213 63 70 86Z" fill={"url(#"+uid+"roof)"}/><path d="M25 52 70 75v18L25 70Z" fill={stall.dark}/><path d="M70 75 213 54v18L70 93Z" fill={stall.color}/>
 <path d="M27 51 168 30 213 53" fill="none" stroke="#ffffff" strokeOpacity=".65" strokeWidth="2"/>
 </svg>;
}
export function MarketVillage({introduction,afterScene,afterCard}:{introduction?:ReactNode;afterScene?:ReactNode;afterCard?:ReactNode}={}){
 const [story,setStory]=useState({selected:0,elapsed:0,ambient:0,manual:false});
 const {selected}=story;
 const [open,setOpen]=useState(false),[visible,setVisible]=useState(false);
 const root=useRef<HTMLElement>(null);
 const [running,setRunning]=useState(true),[reduced,setReduced]=useState(true),[awake,setAwake]=useState(true),[ready,setReady]=useState(false);
 const pause=()=>setRunning(false);
 const choose=(index:number)=>{setRunning(false);setStory(current=>({...current,selected:index,elapsed:15.5,manual:true}));};
 const resume=()=>{setStory(current=>current.manual?{...current,elapsed:0,manual:false}:current);setRunning(true);};
 useEffect(()=>{const media=matchMedia("(prefers-reduced-motion: reduce)");const update=()=>{setReduced(media.matches);if(media.matches)setRunning(false);};const visibility=()=>setAwake(!document.hidden);update();visibility();media.addEventListener("change",update);document.addEventListener("visibilitychange",visibility);return()=>{media.removeEventListener("change",update);document.removeEventListener("visibilitychange",visibility);};},[]);
 // One clock drives the interface, two agents and handover. Pausing preserves its exact progress.
 useEffect(()=>{if(!running||reduced||!visible||!awake||open||!ready)return;let last=performance.now();const timer=setInterval(()=>{const now=performance.now(),delta=Math.min((now-last)/1000,.1);last=now;setStory(current=>{const elapsed=current.elapsed+delta;return elapsed>=16?{selected:(current.selected+1)%4,elapsed:elapsed-16,ambient:current.ambient+delta,manual:false}:{...current,elapsed,ambient:current.ambient+delta};});},33);return()=>clearInterval(timer);},[running,reduced,visible,awake,open,ready]);
 const elapsed=reduced||!ready?15.5:story.elapsed;
 const phase=elapsed<3?0:elapsed<11?1:2;
 const requests=["Necesito un guion","Quiero entender un informe","Busco ideas para un afiche","Quiero explorar un video"];
 useEffect(()=>{const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting));if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[]);
 const stall=marketStalls[selected], sample=reviewDeliveries.find(item=>item.manifest.deliveryId===stall.sampleId)!,content=sample.manifest.content;
 const service="serviceId" in stall?getService(stall.serviceId):undefined;
 return <section ref={root} className={"market-village "+(visible&&awake&&!open&&!reduced&&running&&ready?"is-visible":"")} aria-label="Mercado de posibilidades">{introduction}<p className="market-eyebrow">Explora las posibilidades <span>· ejemplos ilustrativos</span></p><div className={"market-stage "+(ready?"has-three":"")} onFocusCapture={pause}><MarketScene selected={selected} elapsed={elapsed} ambient={story.ambient} active={visible&&awake&&!open} reduced={reduced} onReady={setReady}/><div className="market-fallback"><div className="market-platform" aria-hidden="true"/><div className="market-stalls">{marketStalls.map((item,index)=><button key={item.id} className={"market-booth "+(selected===index?"is-selected":"")} style={{"--stall-color":item.color,"--stall-dark":item.dark} as CSSProperties} aria-pressed={selected===index} aria-label={"Explorar "+item.name} onClick={()=>choose(index)}><Booth index={index}/><span className="market-booth-label">{item.name}</span></button>)}</div><span className="market-sign" aria-hidden="true">✦ BAZAAR</span></div><div className={"market-request "+(phase===0&&ready&&!reduced?"is-speaking":"")} aria-hidden={phase!==0||!ready||reduced}>{requests[selected]}</div></div><div className="market-story-toolbar"><ol className="market-story-steps" aria-label="Cómo colabora tu agente">{["Tu solicitud","El agente explora","Recibes una muestra"].map((label,index)=><li key={label} aria-current={ready&&index===phase?"step":undefined}><span aria-hidden="true">{index+1}</span>{label}</li>)}</ol><div className="market-tour-controls"><span>{running&&!reduced&&ready?"Un paseo por las posibilidades":"Explora a tu ritmo"}</span><Button variant="quiet" disabled={reduced||!ready} onClick={()=>{if(running)pause();else resume();}}>{running&&!reduced&&ready?"Pausar recorrido":"Reanudar recorrido"}</Button></div></div>
 {afterScene}
 <div className="market-information" onMouseEnter={pause} onFocusCapture={pause}><div className="market-mini" aria-hidden="true">{content.kind==="gallery"?<img src={reviewFilePaths[content.variants[0].fileId]} alt=""/>:content.kind==="script"?<><b>01</b><span>{content.scenes[0].title}</span><i/><i/><i/></>:content.kind==="report"?<><b>≡</b><span>Resumen</span><i/><i/><i/></>:<><b>▶</b><span>8 segundos</span></>}</div><div><div key={selected} className="market-information-heading"><h2>{stall.name}</h2><small>{service?"Servicio listado · Testnet":"Muestra de ejemplo"}</small></div><p>{stall.description}</p><div className="market-information-actions">{service?<ButtonLink href={"/resources/"+service.id} variant="quiet">Ver servicio listado →</ButtonLink>:<Button variant="quiet" onClick={()=>{pause();setOpen(true);}}>Ampliar muestra →</Button>}<a href="/catalogo">Explorar el mercado</a></div></div></div>
 {afterCard}
 <Modal open={open} onClose={()=>setOpen(false)} title={"Muestra de "+stall.name.toLowerCase()} wide>{open&&<div className="market-preview"><span className="ui-pill ui-pill--warning">Ejemplo ilustrativo de Bazaar</span><h3>{sample.manifest.title}</h3>{content.kind==="gallery"?<div className="market-preview-images">{content.variants.map(item=><figure key={item.id}><img src={reviewFilePaths[item.fileId]} alt={item.title}/><figcaption>{item.title}</figcaption></figure>)}</div>:content.kind==="video"?<video controls playsInline preload="metadata" src={reviewFilePaths[content.clips[0].fileId]}><track default kind="captions" src={reviewFilePaths["captions-demo"]} srcLang="es" label="Español"/></video>:content.kind==="report"?<div>{content.sections.map(item=><section key={item.id}><h4>{item.title}</h4><p>{item.body}</p>{item.findings&&<ul>{item.findings.map(text=><li key={text}>{text}</li>)}</ul>}</section>)}</div>:<p>{sample.manifest.summary}</p>}</div>}</Modal></section>;
}
