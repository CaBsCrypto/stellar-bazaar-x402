import {measuredHandler} from '../../../../../../../lib/acceptance-meter.ts';
import {marketFileHandlers} from '../../../../../../../lib/market-file-delivery.ts';
export const runtime='nodejs';
export const POST=measuredHandler(async(request:Request,context:{params:Promise<{id:string}>})=>marketFileHandlers.confirm(request,(await context.params).id));
