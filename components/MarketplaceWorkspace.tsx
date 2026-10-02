'use client';
import {useEffect,useRef,useState} from 'react';
import type {ServiceCard} from '../lib/types';
import type {MarketOrder} from '../lib/marketplace-store';
import styles from './MarketplaceWorkspace.module.css';

type Service={submissionId:string;card:ServiceCard;cardHash:string;status:string;control?:{expectedRecord:string;domain:string;verificationPath?:string}};
type Order=MarketOrder&{perspective?:'purchase'|'sale'};
const statuses:Record<MarketOrder['phase'],string>={'awaiting-payment':'Pendiente de pago','payment-submitting':'Enviando pago','payment-uncertain':'Pago incierto · conciliar',paid:'Pago verificado · pendiente de agente',executing:'Agente trabajando',delivered:'Entrega disponible','delivery-failed':'Pago verificado · entrega fallida'};
const testnetPassphrase='Test SDF Network ; September 2015';
function saveIntent(name:string,value:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
export default function MarketplaceWorkspace({access,onLock}:{access:string;onLock:()=>void}){
 const [services,setServices]=useState<Service[]>([]),[mine,setMine]=useState<Service[]>([]),[orders,setOrders]=useState<Order[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[payer,setPayer]=useState(''),[input,setInput]=useState('{}');
 const [card,setCard]=useState(''),[submissionId,setSubmissionId]=useState(''),[operationId,setOperationId]=useState('');
 const [selected,setSelected]=useState<Service|null>(null),[uncertain,setUncertain]=useState(false),[paused,setPaused]=useState(true);
 const [savedOrder,setSavedOrder]=useState(''),[savedCard,setSavedCard]=useState('');
 const generation=useRef(0),controller=useRef<AbortController|null>(null),alive=useRef(true);
 async function api(path:string,body?:unknown){const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${access}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store',signal:AbortSignal.any([controller.current!.signal,AbortSignal.timeout(15000)])});const value=await response.json();if(!response.ok)throw Error(value.error?.code??'REQUEST_FAILED');return value;}
 async function run(action:()=>Promise<void>,write=false){const current=++generation.current;controller.current?.abort();controller.current=new AbortController();setBusy(true);setError('');try{await action();}catch(e){if(alive.current&&generation.current===current){setError(e instanceof Error?e.message:'REQUEST_FAILED');if(write&&!(e instanceof Error&&/^(WALLET_|SELECT_STELLAR_TESTNET|JSON_)/.test(e.message)))setUncertain(true);}}finally{if(alive.current&&generation.current===current)setBusy(false);}}
 async function refresh(){if(!alive.current)return;const gen=generation.current;const [catalog,history]=await Promise.all([api('/api/market/services'),api('/api/market/orders')]);if(alive.current&&generation.current===gen){setServices(catalog.services);setMine(catalog.mine);setOrders(history.orders);setPaused(catalog.paused);}}
 useEffect(()=>{alive.current=true;void run(refresh);return()=>{alive.current=false;generation.current++;controller.current?.abort();};},[access]);
 function lock(){alive.current=false;generation.current++;controller.current?.abort();setServices([]);setMine([]);setOrders([]);setCard('');setPayer('');setInput('{}');setSelected(null);setSubmissionId('');setOperationId('');onLock();}
 async function wallet(){const gen=generation.current,api=await import('@stellar/freighter-api');if(!alive.current||gen!==generation.current)return;const connection=await api.requestAccess();if(connection.error)throw Error('WALLET_CONNECTION_REJECTED');const network=await api.getNetworkDetails();if(network.error||network.networkPassphrase!==testnetPassphrase)throw Error('SELECT_STELLAR_TESTNET');if(alive.current&&gen===generation.current)setPayer(connection.address);}
 async function pay(order:Order){const gen=generation.current;const {payment}=await api(`/api/market/orders/${order.operationId}`,{action:'prepare'});if(!alive.current||generation.current!==gen)return;const wallet=await import('@stellar/freighter-api');if(!alive.current||generation.current!==gen)return;const network=await wallet.getNetworkDetails();if(network.error||network.networkPassphrase!==testnetPassphrase)throw Error('SELECT_STELLAR_TESTNET');if(!alive.current||generation.current!==gen)return;const signed=await wallet.signTransaction(payment.unsignedXdr,{networkPassphrase:testnetPassphrase,address:order.payer});if(signed.error||!signed.signedTxXdr||signed.signerAddress!==order.payer)throw Error('WALLET_SIGNING_REJECTED');if(!alive.current||generation.current!==gen)return;await api(`/api/market/orders/${order.operationId}`,{action:'pay',signedXdr:signed.signedTxXdr});await refresh();}
 return <section className={styles.panel} aria-labelledby='market-workspace-title'>
  <div className={styles.header}><div><p>Marketplace · sólo Stellar testnet</p><h2 id='market-workspace-title'>Compras, ventas y mis servicios</h2></div><button onClick={lock}>Bloquear espacio</button></div>
  <p>Tu agente corre en tu infraestructura. Los pagos van a la wallet del vendedor. Las entregas son texto declarado por su agente; verificar el pago no certifica su calidad.</p>
  <button disabled={busy} onClick={()=>void run(refresh)}>Actualizar marketplace</button>
  {busy&&<p role='status'>Procesando…</p>}{error&&<p role='alert'>{error}. Conserva el identificador y actualiza para comprobar el estado; no repitas pagos.</p>}
  {uncertain&&<p role='status'>Una acción requiere comprobación. Las nuevas escrituras están pausadas en esta vista. Conserva tu archivo de intención y recupera el estado antes de continuar.</p>}
  <h3>Servicios disponibles</h3>{paused&&<p role="status">Nuevas publicaciones y compras pausadas. Tu historial sigue disponible.</p>}
  <label>Recuperar intención de compra<input type='file' accept='application/json' disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(!file||file.size>16384){setError('ARCHIVO_INVALIDO');return;}const gen=generation.current;void file.text().then(raw=>{try{const value=JSON.parse(raw),service=services.find(v=>v.card.id===value.serviceId&&v.cardHash===value.cardHash);if(!alive.current||gen!==generation.current)return;if(!service||typeof value.operationId!=='string'||typeof value.payer!=='string'||!value.input)throw Error();const text=JSON.stringify(value.input);setSelected(service);setOperationId(value.operationId);setPayer(value.payer);setInput(text);setSavedOrder(`${value.operationId}|${value.payer}|${text}`);setUncertain(false);}catch{if(alive.current)setError('ARCHIVO_INVALIDO_O_SERVICIO_NO_DISPONIBLE');}});e.target.value='';}}/></label>
  {!services.length&&<p>No hay servicios testnet aprobados disponibles.</p>}
  <div className={styles.grid}>{services.map(service=><article key={service.submissionId}><h4>{service.card.name}</h4><p>{service.card.description}</p><p>{service.card.payment.amount} XLM · testnet</p><button disabled={busy||uncertain||paused} onClick={()=>{setSelected(service);setOperationId(crypto.randomUUID());setInput('{}');}}>Preparar compra</button></article>)}</div>
  {selected&&<form onSubmit={e=>{e.preventDefault();void run(async()=>{await api('/api/market/orders',{operationId,serviceId:selected.card.id,cardHash:selected.cardHash,payer,input:JSON.parse(input)});setSelected(null);await refresh();},true);}}>
   <h3>Comprar {selected.card.name}</h3><p>{selected.card.payment.amount} XLM testnet. Destinatario: <code>{selected.card.payment.destination}</code></p>
   <button type='button' disabled={busy} onClick={()=>void run(wallet)}>Conectar Freighter en testnet</button>
   <label>Cuenta pública del comprador<input value={payer} onChange={e=>setPayer(e.target.value)} autoComplete='off' required/></label>
   <label>Parámetros JSON<textarea value={input} onChange={e=>setInput(e.target.value)} required/></label><p>Campos: {selected.card.input.map(v=>`${v.name} (${v.type}${v.required?', obligatorio':''})`).join(', ')}</p>
   <p>Referencia: <code>{operationId}</code></p><button type='button' onClick={()=>{try{saveIntent('bazaar-order-intent.json',{operationId,serviceId:selected.card.id,cardHash:selected.cardHash,payer,input:JSON.parse(input)});setSavedOrder(`${operationId}|${payer}|${input}`);}catch{setError('JSON_INVALIDO');}}}>Guardar intención de compra</button>
   <button disabled={busy||uncertain||paused||!payer||savedOrder!==`${operationId}|${payer}|${input}`}>Crear pedido sin pagar todavía</button>
  </form>}
  <h3>Historial privado de compras y ventas</h3>
  {!orders.length&&<p>Aún no tienes pedidos.</p>}
  {orders.map(order=><article key={order.operationId}><h4>{order.perspective==='sale'?'Venta':'Compra'} · {order.card.name}</h4><p>{statuses[order.phase]}</p><p>{order.amount} XLM testnet · <time>{order.updatedAt}</time></p><p>Referencia: <code>{order.operationId}</code></p>
   {order.transactionHash&&<p><a href={`https://stellar.expert/explorer/testnet/tx/${order.transactionHash}`} target='_blank' rel='noreferrer'>Transacción testnet</a> · {order.paymentVerifiedAt?'Verificada por Bazaar':'Sin confirmación'}</p>}
   {order.delivery&&<><p>Entrega reportada por vendedor · <code>{order.delivery.reference}</code></p><pre>{order.delivery.text}</pre></>}
   {order.failure&&<p>Fallo de entrega: {order.failure}</p>}
   {order.perspective==='purchase'&&order.phase==='awaiting-payment'&&<button disabled={busy||uncertain||paused} onClick={()=>void run(()=>pay(order),true)}>Firmar y pagar {order.amount} XLM testnet con Freighter</button>}
   {order.perspective==='purchase'&&['payment-submitting','payment-uncertain'].includes(order.phase)&&<button disabled={busy} onClick={()=>void run(async()=>{await api(`/api/market/orders/${order.operationId}`,{action:'reconcile'});await refresh();})}>Conciliar sin volver a pagar</button>}
  </article>)}
  <h3>Mis servicios</h3><p>Envía una Service Card HTTPS con precio XLM testnet (máximo 1 XLM), entrega text/plain e idempotencia. Requiere prueba de control HTTP y revisión manual antes de publicarse.</p>
  <form onSubmit={e=>{e.preventDefault();void run(async()=>{const parsed=JSON.parse(card);await api('/api/market/services',{submissionId,card:parsed,controlProof:{method:'http-well-known',domain:new URL(parsed.url).hostname}});await refresh();},true);}}>
   <label>Ficha JSON<textarea value={card} onChange={e=>setCard(e.target.value)} required/></label>
   <button type='button' disabled={busy||uncertain||paused} onClick={()=>{try{const id=submissionId||crypto.randomUUID();saveIntent('bazaar-service-intent.json',{submissionId:id,card:JSON.parse(card)});setSubmissionId(id);setSavedCard(card);}catch{setError('JSON_INVALIDO');}}}>Guardar intención de publicación</button>
   <label>Recuperar intención guardada<input type='file' accept='application/json' disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(!file||file.size>32768){setError('ARCHIVO_INVALIDO');return;}void file.text().then(raw=>{try{const value=JSON.parse(raw);if(!alive.current||typeof value.submissionId!=='string'||!value.card)throw Error();const text=JSON.stringify(value.card,null,2);setSubmissionId(value.submissionId);setCard(text);setSavedCard(text);setUncertain(false);}catch{if(alive.current)setError('ARCHIVO_INVALIDO');}});e.target.value='';}}/></label>
   <p>Referencia: <code>{submissionId||'Guarda la intención primero'}</code></p><button disabled={!submissionId||busy||uncertain||paused||savedCard!==card}>Enviar a revisión</button>
  </form>
  {mine.map(service=><article key={service.submissionId}><h4>{service.card.name}</h4><p>Estado: {service.status}</p><code>{service.submissionId}</code>{service.control&&<details><summary>Prueba de control del endpoint</summary><p>Publica este contenido exacto en {service.control.domain}{service.control.verificationPath}:</p><pre>{service.control.expectedRecord}</pre></details>}<button disabled={busy||uncertain||service.status==='withdrawn'} onClick={()=>void run(async()=>{await api(`/api/market/services/${service.submissionId}`,{action:'withdraw'});await refresh();},true)}>Retirar de nuevas compras</button></article>)}
 </section>;
}
