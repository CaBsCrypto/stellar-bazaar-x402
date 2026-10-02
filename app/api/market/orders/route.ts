import {marketHandlers} from '../../../../lib/marketplace-http.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=marketHandlers.orders;
export const POST=marketHandlers.create;
