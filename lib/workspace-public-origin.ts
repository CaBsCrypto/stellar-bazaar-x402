import {WorkspaceError} from './workspace-types.ts';
/** Platform-generated hostname is trusted configuration, never a forwarded request header. */
export function workspacePublicOrigin():string|undefined {
 const configured=process.env.BAZAAR_WORKSPACE_PUBLIC_ORIGIN;
 if(configured!=='vercel-preview')return configured;
 const host=process.env.VERCEL_URL;
 if(process.env.VERCEL!=='1'||process.env.VERCEL_ENV!=='preview'||!host||!/^stellar-bazaar-x402-[a-z0-9-]+\.vercel\.app$/.test(host))throw new WorkspaceError('WORKSPACE_UNAVAILABLE');
 return `https://${host}`;
}
