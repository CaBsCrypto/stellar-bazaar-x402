"use client";
import {useEffect,useState} from "react";
import dynamic from "next/dynamic";
import {DeliverableReview} from "./DeliverableReview";
import {Navbar} from "./Navbar";
import {Footer} from "./Footer";
import {Breadcrumbs} from "./Breadcrumbs";
import {Button} from "./ui";
import MarketplaceWorkspace from './MarketplaceWorkspace';
const OperationHistory=dynamic(()=>import("./OperationHistory").then(module=>module.OperationHistory),{loading:()=> <p role="status" className="shell">Abriendo tus operaciones…</p>});
export function HistoryEntry({marketEnabled=false}:{marketEnabled?:boolean}={}){
 const [mode,setMode]=useState<"checking"|"demo"|"private"|"locked">("checking");
 const [view,setView]=useState<"market"|"operations">("market");
 const [access,setAccess]=useState("");const [manual,setManual]=useState("");
 useEffect(()=>{const detect=()=>{const url=new URL(window.location.href);const hash=new URLSearchParams(url.hash.slice(1));const supplied=hash.has("token")||url.searchParams.has("token");const token=hash.get("token")??url.searchParams.get("token")??"";
 if(supplied){url.searchParams.delete("token");hash.delete("token");url.hash=hash.toString();window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);setAccess(token);setView("market");setMode("private");}else setMode("demo");};detect();window.addEventListener("hashchange",detect);return ()=>window.removeEventListener("hashchange",detect);},[]);
 const leave=()=>{setAccess("");setManual("");setView("market");setMode("locked");};
 const explore=()=>{setAccess("");setManual("");setView("market");setMode("demo");};
 const views=<nav aria-label="Vistas de tu espacio" className="history-nav"><Button variant={view==="market"?"primary":"secondary"} aria-current={view==="market"?"page":undefined} onClick={()=>setView("market")}>Compras y ventas</Button><Button variant={view==="operations"?"primary":"secondary"} aria-current={view==="operations"?"page":undefined} onClick={()=>setView("operations")}>Otras operaciones</Button></nav>;
 if(mode==="checking")return <main className="shell ui-page" role="status">Comprobando acceso…</main>;
 if(mode==="private"){
  if(!marketEnabled)return <OperationHistory key={access} initialAccess={access} onLocked={leave} onExploreDemo={explore}/>;
  if(view==="operations")return <><div className="shell ui-page">{views}</div><OperationHistory key={access} initialAccess={access} onLocked={leave} onExploreDemo={explore}/></>;
  return <><Navbar prefetch={false}/><main className="operation-history shell"><Breadcrumbs prefetch={false} items={[{label:"Mi espacio privado"}]}/><h1>Mi espacio privado</h1>{views}<MarketplaceWorkspace key={`market-${access}`} access={access} onLock={leave} view="history"/></main><Footer prefetch={false}/></>;
 }
 const form=<details className="history-manual"><summary>Tengo un acceso de lectura</summary><form onSubmit={e=>{e.preventDefault();if(manual.trim()){setAccess(manual.trim());setManual("");setView("market");setMode("private");}}}><label htmlFor="manual-history-access">Acceso de lectura</label><input id="manual-history-access" type="password" autoComplete="off" value={manual} onChange={e=>setManual(e.target.value)}/><Button type="submit" disabled={!manual.trim()}>Abrir mi biblioteca</Button></form></details>;
 if(mode==="locked")return <><Navbar prefetch={false}/><main className="shell ui-page"><h1>Biblioteca bloqueada</h1><p>Abre nuevamente el enlace original de tu agente para recuperar tus entregas.</p><Button onClick={()=>setMode("demo")}>Explorar demostración</Button>{form}</main></>;
 return <DeliverableReview accessEntry={form}/>;
}
