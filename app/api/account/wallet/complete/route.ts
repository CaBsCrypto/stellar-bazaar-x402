import {demoHandlers} from '@/lib/demo-http';
import {measuredHandler} from '@/lib/acceptance-meter';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const POST=measuredHandler(demoHandlers.complete);
