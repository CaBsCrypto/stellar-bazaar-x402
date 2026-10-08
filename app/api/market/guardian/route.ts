import {measuredHandler} from '../../../../lib/acceptance-meter.ts';
import {marketGuardianHandlers} from '../../../../lib/market-guardian.ts';
export const runtime='nodejs';
export const GET=measuredHandler(marketGuardianHandlers.read);
export const POST=measuredHandler(marketGuardianHandlers.write);
