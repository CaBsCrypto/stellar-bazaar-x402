import { measuredHandler } from '../../../../lib/acceptance-meter.ts';
import {marketHandlers} from '../../../../lib/marketplace-http.ts';
export const runtime='nodejs';
export const POST = measuredHandler(marketHandlers.control);
