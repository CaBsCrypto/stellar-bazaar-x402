import { measuredHandler } from '../../../../../lib/acceptance-meter.ts';
import {marketHandlers} from '../../../../../lib/marketplace-http.ts';
export const runtime='nodejs';
async function handlePOST(request:Request,context:{params:Promise<{id:string}>}){return marketHandlers.withdraw(request,(await context.params).id);}

export const POST = measuredHandler(handlePOST);
