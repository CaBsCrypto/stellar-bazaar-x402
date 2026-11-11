import {createMarketServiceQrHandler} from '@/lib/market-service-share-http';
import {measuredHandler} from '@/lib/acceptance-meter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const handle = measuredHandler(createMarketServiceQrHandler(), {classify: () => ({profile: 'public', newOperation: false})});
type Context = {params: Promise<{id: string}>};
export async function GET(request: Request, {params}: Context) {return handle(request, (await params).id);}
export async function HEAD(request: Request, {params}: Context) {return handle(request, (await params).id);}
