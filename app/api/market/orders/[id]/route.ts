import {marketHandlers} from '../../../../../lib/marketplace-http.ts';
export const runtime='nodejs';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return marketHandlers.read(request,(await context.params).id);}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return marketHandlers.action(request,(await context.params).id);}
