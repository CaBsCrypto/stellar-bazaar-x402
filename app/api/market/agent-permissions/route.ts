import { measuredHandler } from '../../../../lib/acceptance-meter.ts';
import { marketHandlers } from '../../../../lib/marketplace-http.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = measuredHandler(marketHandlers.permissions);
export const POST = measuredHandler(marketHandlers.permissions);
