import {marketHandlers} from '../../../../lib/marketplace-http.ts';
export const dynamic='force-dynamic';
export async function POST(request:Request){return marketHandlers.capacity(request);}
