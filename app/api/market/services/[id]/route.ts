import { measuredHandler } from '../../../../../lib/acceptance-meter.ts';
import {marketHandlers} from '../../../../../lib/marketplace-http.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handleGET(request:Request,context:{params:Promise<{id:string}>}){return marketHandlers.submission(request,(await context.params).id);}
async function handlePOST(request:Request,context:{params:Promise<{id:string}>}){return marketHandlers.withdraw(request,(await context.params).id);}

export const POST = measuredHandler(handlePOST);
export const GET = measuredHandler(handleGET);
