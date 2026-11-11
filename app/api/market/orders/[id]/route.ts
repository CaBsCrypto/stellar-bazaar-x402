import { measuredHandler } from '../../../../../lib/acceptance-meter.ts';
import {marketHandlers} from '../../../../../lib/marketplace-http.ts';
export const runtime='nodejs';
async function handleGET(request:Request,context:{params:Promise<{id:string}>}){return marketHandlers.read(request,(await context.params).id);}
async function handlePOST(request:Request,context:{params:Promise<{id:string}>}){return marketHandlers.action(request,(await context.params).id);}

export const GET = measuredHandler(handleGET);

export const POST = measuredHandler(handlePOST);
