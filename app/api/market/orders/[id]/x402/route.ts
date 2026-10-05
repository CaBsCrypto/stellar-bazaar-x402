import {measuredHandler} from '../../../../../../lib/acceptance-meter.ts';
import {marketX402Handler} from '../../../../../../lib/marketplace-x402.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const POST=measuredHandler(async(request:Request,context:{params:Promise<{id:string}>})=>marketX402Handler(request,(await context.params).id));
