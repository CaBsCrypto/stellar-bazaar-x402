import {measuredHandler} from '@/lib/acceptance-meter';
import {treasuryNativeHandlers} from '@/lib/commission/v1/native/treasury-runtime';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export const maxDuration=10;
export const GET=measuredHandler(treasuryNativeHandlers.GET);
export const POST=measuredHandler(treasuryNativeHandlers.POST);
