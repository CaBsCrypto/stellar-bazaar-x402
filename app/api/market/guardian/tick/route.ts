import {measuredHandler} from '../../../../../lib/acceptance-meter.ts';
import {marketGuardianHandlers} from '../../../../../lib/market-guardian.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=measuredHandler(marketGuardianHandlers.tick);
