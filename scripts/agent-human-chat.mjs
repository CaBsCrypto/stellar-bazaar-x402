/** Read-only interactive example. No identity provisioning, payments or private links. */
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { BazaarAgentClient } from '../lib/bazaar-agent-client.ts';
const baseUrl=process.env.BASE_URL??'http://localhost:3000';
const agent=new BazaarAgentClient({baseUrl});
const rl=readline.createInterface({input,output});
console.log('Demostración de conversación. Solo consulta el catálogo; no compra ni genera accesos privados.');
try {
 while(true){
  const question=(await rl.question('Tu solicitud (salir para terminar): ')).trim();
  if(!question||['salir','exit'].includes(question.toLowerCase())) break;
  if(/historial|reporte|enlace|link/i.test(question)) {
   console.log(`Biblioteca de ejemplo: ${new URL('/history/review',baseUrl)}. Para entregas privadas configura una pareja registrada siguiendo docs/HISTORY_IDENTITY.md.`);
   continue;
  }
  try {
   const services=await agent.searchServicesREST(question);
   console.log(`Servicios encontrados: ${services.length}. Revisa disponibilidad, condiciones y presupuesto antes de autorizar una compra.`);
  } catch { console.log('No se pudo consultar el catálogo. No se ejecutó ninguna compra.'); }
 }
} finally { rl.close(); }
