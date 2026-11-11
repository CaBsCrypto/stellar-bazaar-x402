import { measuredHandler } from '../../../../lib/acceptance-meter.ts';
import {marketHandlers} from '../../../../lib/marketplace-http.ts';
import {withX402AcceptanceRuntimeProof} from '../../../../lib/x402-acceptance-runtime-proof.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const measuredOrdersGet=measuredHandler(marketHandlers.orders);
export async function GET(request:Request){return withX402AcceptanceRuntimeProof(request,await measuredOrdersGet(request));}
export const POST = measuredHandler(marketHandlers.create);
