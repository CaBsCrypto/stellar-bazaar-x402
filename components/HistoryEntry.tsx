"use client";
import {useEffect,useState} from "react";
import {DeliverableReview} from "./DeliverableReview";
import {OperationHistory} from "./OperationHistory";
import {Navbar} from "./Navbar";
import {Button} from "./ui";
export function HistoryEntry(){
 const [mode,setMode]=useState<"checking"|"demo"|"private"|"locked">("checking");
 const [access,setAccess]=useState("");const [manual,setManual]=useState("");
 useEffect(()=>{const detect=()=>{const url=new URL(window.location.href);const hash=new URLSearchParams(url.hash.slice(1));const supplied=hash.has("token")||url.searchParams.has("token");const token=hash.get("token")??url.searchParams.get("token")??"";
 if(supplied){url.searchParams.delete("token");hash.delete("token");url.hash=hash.toString();window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);setAccess(token);setMode("private");}else setMode("demo");};detect();window.addEventListener("hashchange",detect);return ()=>window.removeEventListener("hashchange",detect);},[]);
 const leave=()=>{setAccess("");setManual("");setMode("locked");};
 if(mode==="checking")return <main className="shell ui-page" role="status">Comprobando acceso…</main>;
 if(mode==="private")return <OperationHistory key={access} initialAccess={access} onLocked={leave} onExploreDemo={()=>{setAccess("");setManual("");setMode("demo");}}/>;
 const form=<details className="history-manual"><summary>Tengo un acceso de lectura</summary><form onSubmit={e=>{e.preventDefault();if(manual.trim()){setAccess(manual.trim());setManual("");setMode("private");}}}><label htmlFor="manual-history-access">Acceso de lectura</label><input id="manual-history-access" type="password" autoComplete="off" value={manual} onChange={e=>setManual(e.target.value)}/><Button type="submit" disabled={!manual.trim()}>Abrir mi biblioteca</Button></form></details>;
 if(mode==="locked")return <><Navbar/><main className="shell ui-page"><h1>Biblioteca bloqueada</h1><p>Abre nuevamente el enlace original de tu agente para recuperar tus entregas.</p><Button onClick={()=>setMode("demo")}>Explorar demostración</Button>{form}</main></>;
 return <DeliverableReview accessEntry={form}/>;
}
