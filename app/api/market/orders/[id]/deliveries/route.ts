import {measuredHandler} from '../../../../../../lib/acceptance-meter.ts';
import {marketFileHandlers} from '../../../../../../lib/market-file-delivery.ts';
export const runtime='nodejs';
export const GET=measuredHandler(async(request:Request,context:{params:Promise<{id:string}>})=>marketFileHandlers.read(request,(await context.params).id));
export const POST=measuredHandler(async(request:Request,context:{params:Promise<{id:string}>})=>marketFileHandlers.prepare(request,(await context.params).id));
