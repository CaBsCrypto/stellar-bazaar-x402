'use client';
import {useState} from 'react';
type Incident={operationId:string;code:string;transactionHash?:string;canReconcile:boolean};
export default function MarketOperations(){
 const [access,setAccess]=useState(''),[result,setResult]=useState<Record<string,unknown>|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function run(body?:unknown){setBusy(true);setMessage('');try{const r=await fetch('/api/market/guardian',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+access,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();setResult(data);if(!r.ok)setMessage('Acción no confirmada: '+(data.error?.code??r.status));}catch{setMessage('Respuesta no confirmada. Consulta el estado antes de repetir.');}finally{setBusy(false);}}
 const incidents=(result?.incidents??[]) as Incident[];
 return <main className="shell ui-page"><h1>Guardián de Bazaar</h1><p>Configuración, capacidad e incidentes de Testnet. La reconciliación consulta la red y no vuelve a enviar pagos. La suspensión de proveedores requiere una decisión humana.</p>
 <label htmlFor="operator-access">Acceso privado del operador</label><input id="operator-access" type="password" autoComplete="off" value={access} onChange={e=>setAccess(e.target.value)} />
 <p>El acceso se mantiene solo en memoria durante esta sesión.</p>
 <div className="button-row"><button disabled={busy||!access} onClick={()=>run()}>Consultar estado</button><button disabled={busy||!access} onClick={()=>run({action:'probe-storage'})}>Verificar conexión R2</button><button disabled={busy||!access} onClick={()=>run({action:'run'})}>Reconciliar y limpiar vencidos</button><button onClick={()=>{setAccess('');setResult(null);}}>Cerrar acceso</button></div>
 <p role="status">{busy?'Comprobando…':message}</p>
 {incidents.length>0&&<table><thead><tr><th>Operación</th><th>Incidente</th><th>Recuperación</th></tr></thead><tbody>{incidents.map((i,index)=><tr key={i.operationId+index}><td>{i.operationId}</td><td>{i.code}</td><td>{i.canReconcile?<button disabled={busy} onClick={()=>run({action:'reconcile',operationId:i.operationId})}>Consultar pago</button>:'Revisión humana'}</td></tr>)}</tbody></table>}
 {result&&<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(result,null,2)}</pre>}<a href="/storage">Política de archivos e historial</a></main>;
}
