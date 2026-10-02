import {marketHandlers} from '../../../../../lib/marketplace-http.ts';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return marketHandlers.withdraw(request,(await context.params).id);}
