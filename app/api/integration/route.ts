import {bazaarIntegrationContract} from '../../../lib/bazaar-integration-contract.ts';

export const runtime='nodejs';
export const dynamic='force-static';

/** Public protocol documentation only. Never reads a workspace, order or budget. */
export function GET(){
 return Response.json(bazaarIntegrationContract(),{headers:{'Cache-Control':'public, max-age=300, stale-while-revalidate=3600','X-Content-Type-Options':'nosniff'}});
}
