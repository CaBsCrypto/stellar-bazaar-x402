import {demoHandlers} from '@/lib/demo-http';
import {measuredHandler} from '../../../../lib/acceptance-meter.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=measuredHandler(demoHandlers.history);
