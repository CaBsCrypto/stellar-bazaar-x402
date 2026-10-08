"use client";
import {useEffect,useRef,useState,type ChangeEvent} from "react";
import dynamic from "next/dynamic";
import {DeliverableReview} from "./DeliverableReview";
import {Navbar} from "./Navbar";
import {Footer} from "./Footer";
import {Breadcrumbs} from "./Breadcrumbs";
import {Button} from "./ui";
import DemoAccount from './DemoAccount';
import MarketplaceWorkspace from './MarketplaceWorkspace';
import {parsePilotAccess} from '../lib/pilot-access';
const OperationHistory=dynamic(()=>import("./OperationHistory").then(module=>module.OperationHistory),{loading:()=> <p role="status" className="shell">Abriendo tus operaciones…</p>});
function capsuleToken(raw:string):string {
 if(new TextEncoder().encode(raw).byteLength>4096)throw Error("INVALID_ACCESS_CAPSULE");
 const value:unknown=JSON.parse(raw);
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("INVALID_ACCESS_CAPSULE");
 if((value as Record<string,unknown>).version==='bazaar-pilot-access/v1')return parsePilotAccess(raw,location.origin).human;
 if(Object.keys(value).sort().join(",")!=="kind,token,version")throw Error("INVALID_ACCESS_CAPSULE");
 const capsule=value as Record<string,unknown>;
 if(capsule.version!==1||capsule.kind!=="bazaar-private-read-access"||typeof capsule.token!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(capsule.token))throw Error("INVALID_ACCESS_CAPSULE");
 return capsule.token;
}
export function HistoryEntry({marketEnabled=false,demoEnabled=false}:{marketEnabled?:boolean;demoEnabled?:boolean}={}){
 const [mode,setMode]=useState<"checking"|"demo"|"private"|"locked">("checking");
 const [view,setView]=useState<"market"|"operations">("market");
 const [access,setAccess]=useState("");const [manual,setManual]=useState("");
 const [capsuleError,setCapsuleError]=useState("");const [capsuleReading,setCapsuleReading]=useState(false);
 const generation=useRef(0),alive=useRef(false);
 const invalidateCapsule=()=>{generation.current++;setCapsuleReading(false);setCapsuleError("");};
 const restoreCapsule=async(event:ChangeEvent<HTMLInputElement>)=>{
  const file=event.currentTarget.files?.[0];event.currentTarget.value="";
  const current=++generation.current;setCapsuleError("");setCapsuleReading(false);if(!file)return;
  setCapsuleReading(true);
  try{
   if(file.size>4096)throw Error("INVALID_ACCESS_CAPSULE");
   const raw=await file.text();if(!alive.current||current!==generation.current)return;
   const token=capsuleToken(raw);setAccess(token);setManual("");setView("market");setMode("private");setCapsuleReading(false);
  }catch{
   if(alive.current&&current===generation.current){setCapsuleReading(false);setCapsuleError("Elige el archivo de recuperación de este Bazaar o una cápsula de acceso válida.");}
  }
 };
 useEffect(()=>{alive.current=true;const detect=()=>{invalidateCapsule();const url=new URL(window.location.href);const hash=new URLSearchParams(url.hash.slice(1));const supplied=hash.has("token")||url.searchParams.has("token");const token=hash.get("token")??url.searchParams.get("token")??"";
 if(supplied){url.searchParams.delete("token");hash.delete("token");url.hash=hash.toString();window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);if(/^[A-Za-z0-9_-]{43}$/.test(token)){setAccess(token);setView("market");setMode("private");}else{setAccess('');setMode('locked');setCapsuleError('El enlace de acceso no es válido. Recupera tu archivo privado.');}}else setMode(marketEnabled?"locked":"demo");};detect();window.addEventListener("hashchange",detect);return ()=>{alive.current=false;generation.current++;window.removeEventListener("hashchange",detect);};},[marketEnabled]);
 const leave=()=>{invalidateCapsule();setAccess("");setManual("");setView("market");setMode("locked");};
 const explore=()=>{invalidateCapsule();setAccess("");setManual("");setView("market");setMode(marketEnabled?"locked":"demo");};
 const views=<nav aria-label="Vistas de tu espacio" className="history-nav"><Button variant={view==="market"?"primary":"secondary"} aria-current={view==="market"?"page":undefined} onClick={()=>setView("market")}>Compras y ventas</Button><Button variant={view==="operations"?"primary":"secondary"} aria-current={view==="operations"?"page":undefined} onClick={()=>setView("operations")}>Otras operaciones</Button></nav>;
 if(mode==="checking")return <main className="shell ui-page" role="status">Comprobando acceso…</main>;
 if(mode==="private"){
  if(!marketEnabled)return <OperationHistory key={access} initialAccess={access} onLocked={leave} onExploreDemo={explore}/>;
  if(view==="operations")return <><div className="shell ui-page">{views}</div><OperationHistory key={access} initialAccess={access} onLocked={leave} onExploreDemo={explore}/></>;
  return <><Navbar prefetch={false}/><main className="operation-history shell"><Breadcrumbs prefetch={false} items={[{label:"Mi espacio privado"}]}/><h1>Mi espacio privado</h1><p><a href="/storage">Archivos, privacidad y plazo del historial</a></p>{demoEnabled&&<DemoAccount key={access} access={access}/>}{views}<MarketplaceWorkspace key={`market-${access}`} access={access} onLock={leave} view="history"/></main><Footer prefetch={false}/></>;
 }
 const form=<details className="history-manual"><summary>Tengo mi archivo o acceso privado</summary><form onSubmit={e=>{e.preventDefault();invalidateCapsule();if(/^[A-Za-z0-9_-]{43}$/.test(manual.trim())){setAccess(manual.trim());setManual("");setView("market");setMode("private");}else setCapsuleError('El acceso no es válido.');}}><label htmlFor="manual-history-access">Acceso privado</label><input id="manual-history-access" type="password" autoComplete="off" value={manual} onChange={e=>{invalidateCapsule();setManual(e.target.value);}}/><Button type="submit" disabled={!manual.trim()}>Abrir mi espacio</Button><label htmlFor="history-access-capsule">Restaurar mi archivo de recuperación</label><input id="history-access-capsule" type="file" accept="application/json,.json" onChange={restoreCapsule} aria-invalid={!!capsuleError} aria-describedby={`history-capsule-help${capsuleError?" history-capsule-error":""}`}/><p id="history-capsule-help">El archivo raíz recupera el acceso humano de este origen. También puedes usar una cápsula de lectura. El acceso permanece sólo en memoria.</p>{capsuleReading&&<p role="status">Leyendo el archivo…</p>}{capsuleError&&<p id="history-capsule-error" role="alert">{capsuleError}</p>}</form></details>;
 if(mode==="locked")return <><Navbar prefetch={false}/><main className="shell ui-page"><h1>Abre tu espacio privado</h1><p><a href="/storage">Archivos, privacidad y plazo del historial</a></p><p>Recupera tu archivo privado o abre el enlace de acceso que conservaste para consultar tus compras, ventas y servicios.</p>{marketEnabled?<a className='ui-button ui-button--primary' href='/open'>Crear o recuperar mi espacio</a>:<Button onClick={explore}>Explorar demostración</Button>}{form}</main><Footer prefetch={false}/></>;
 return <DeliverableReview accessEntry={form}/>;
}
