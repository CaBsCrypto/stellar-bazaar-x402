import { measuredHandler } from '../../../../lib/acceptance-meter.ts';
import {marketHandlers} from '../../../../lib/marketplace-http.ts';
export const runtime='nodejs';
export const GET = measuredHandler(marketHandlers.review);
export const POST = measuredHandler(marketHandlers.review);
