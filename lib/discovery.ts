import type {PaidService, RankedService, ServiceCard, ValidationOutcome} from "./types";

const aliases:Record<string,string[]>={riesgo:["risk","security"],swap:["swap","liquidity","defi"],contrato:["contract","soroban"],mercado:["market","market-data"],libro:["ledger"],cuenta:["ledger","stellar"],herramienta:["mcp"],datos:["analytics","market-data"]};
const tokens=(value:string)=>value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/[^a-z0-9]+/).filter(Boolean);

export function rankServices(items:PaidService[],query:string):RankedService[]{
 const queryTokens=tokens(query); if(!queryTokens.length)return items.map(service=>({service,score:0,reasons:["orden estable del catálogo"]}));
 const expanded=new Set(queryTokens.flatMap(token=>[token,...(aliases[token]??[])]));
 return items.map(service=>{const name=new Set<string>(tokens(service.name)),tags=new Set<string>(service.tags.flatMap(tokens)),description=new Set<string>(tokens(service.description)),kind=new Set<string>([service.kind]);let score=0;const reasons:string[]=[];
  for(const term of expanded){if(name.has(term)){score+=5;reasons.push(`nombre coincide con “${term}”`)}else if(tags.has(term)){score+=3;reasons.push(`tag coincide con “${term}”`)}else if(kind.has(term)){score+=2;reasons.push(`tipo ${term.toUpperCase()}`)}else if(description.has(term)){score+=1;reasons.push(`descripción menciona “${term}”`)}}
  return {service,score,reasons:[...new Set(reasons)]};}).filter(result=>result.score>0).sort((a,b)=>b.score-a.score||a.service.name.localeCompare(b.service.name));
}

export function filterServices(items:PaidService[],filters:{kind?:string;scheme?:string;asset?:string;network?:string;maxPrice?:number}){
 return items.filter(s=>(!filters.kind||s.kind===filters.kind)&&(!filters.scheme||s.payment.scheme===filters.scheme)&&(!filters.asset||s.payment.asset===filters.asset)&&(!filters.network||s.network===filters.network)&&(!filters.maxPrice||Number(s.payment.amount)<=filters.maxPrice));
}

export function validateServiceCard(card:ServiceCard):ValidationOutcome[]{
 const out:ValidationOutcome[]=[];const rule=(name:string,ok:boolean,pass:string,fail:string,status:"fail"|"warning"="fail")=>out.push({rule:name,status:ok?"pass":status,reason:ok?pass:fail});
 rule("schema.version",card.version==="bazaar.service-card/v0","Versión MVP reconocida.","Usa bazaar.service-card/v0.");
 rule("resource.kind",card.kind==="http"||card.kind==="mcp","Tipo HTTP/MCP válido.","kind debe ser http o mcp.");
 let url:URL|undefined;try{url=new URL(card.url)}catch{};rule("resource.url",!!url&&(url.protocol==="https:"||url.hostname==="localhost"),"URL HTTPS/local válida.","URL inválida: se requiere HTTPS (localhost permitido para desarrollo).");
 const unsafe=/\.\.|[\r\n#]|@/.test(card.routeTemplate);rule("route.template",card.routeTemplate.startsWith("/")&&!unsafe,"Route template relativo y sin patrones peligrosos.","routeTemplate debe comenzar con / y no contener .., @, # o saltos de línea.");
 const params=[...card.routeTemplate.matchAll(/\{([^}]+)\}/g)].map(m=>m[1]);const inputs=new Set(card.input.map(i=>i.name));rule("route.inputs",params.every(p=>inputs.has(p)),"Todos los parámetros tienen input declarado.","Cada {parámetro} de la ruta debe existir en input.");
 rule("payment.network",card.network==="stellar:testnet","Network declarada como Stellar Testnet.","El MVP sólo acepta stellar:testnet.");
 rule("payment.scheme",card.payment.scheme==="exact"||card.payment.scheme==="upto","Scheme reconocido.","Scheme debe ser exact o upto.");
 rule("payment.amount",/^\d+(\.\d{1,7})?$/.test(card.payment.amount)&&Number(card.payment.amount)>0,"Precio positivo con precisión válida.","amount debe ser decimal positivo (máximo 7 decimales).");
 rule("payment.asset",card.payment.asset.trim().length>0,"Asset declarado explícitamente.","asset es obligatorio.");
 rule("payment.destination",/^G[A-Z2-7]{55}$/.test(card.payment.destination),"Destino Stellar con formato público válido.","destination debe ser una cuenta Stellar pública G… de 56 caracteres.");
 rule("provider.description",card.description.trim().length>=20,"Descripción suficiente para discovery.","Añade una descripción de al menos 20 caracteres.","warning");
 return out;
}
