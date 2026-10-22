import QRCode from 'qrcode';
import {demoIngress} from './demo-http.ts';
import {assertMarketEnabled, marketServiceSnapshot} from './marketplace.ts';
import {measuredRead} from './acceptance-meter.ts';
import {assertWorkspaceRequest, workspaceFailure, workspaceHeaders, workspaceRequestOrigin} from './workspace-http.ts';
import {workspacePublicOrigin} from './workspace-public-origin.ts';
import {WorkspaceError} from './workspace-types.ts';
import {publicServicePath, publicServiceUrl} from './market-service-share.ts';

const defaultDependencies = {
  ingress: demoIngress,
  snapshot: () => measuredRead(marketServiceSnapshot),
};

/** Dependency injection is used by local tests; the hosted route always uses native stores and admission. */
export function createMarketServiceQrHandler(dependencies = defaultDependencies) {
  return async function serviceQr(request: Request, serviceId: string): Promise<Response> {
    try {
      assertMarketEnabled();
      assertWorkspaceRequest(request);
      if (!['GET', 'HEAD'].includes(request.method)) throw new WorkspaceError('NOT_FOUND', 404);
      try { publicServicePath(serviceId); } catch { throw new WorkspaceError('NOT_FOUND', 404); }
      const origin = workspaceRequestOrigin(request);
      const configured = workspacePublicOrigin();
      // Production and Preview QR targets must come from deployment configuration.
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname);
      if (configured ? configured !== origin : !loopback || process.env.VERCEL === '1') throw new WorkspaceError('WORKSPACE_UNAVAILABLE', 503);
      await dependencies.ingress(request);
      const snapshot = await dependencies.snapshot();
      if (!snapshot.records.some(record => record.active && !record.service.withdrawn && record.service.card.id === serviceId)) throw new WorkspaceError('NOT_FOUND', 404);
      const svg = await QRCode.toString(publicServiceUrl(origin, serviceId), {type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 320});
      return new Response(request.method === 'HEAD' ? null : svg, {headers: {
        ...workspaceHeaders,
        'Cache-Control': 'public, no-store',
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="bazaar-${serviceId}.svg"`,
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      }});
    } catch (error) {
      const response = workspaceFailure(error);
      return request.method === 'HEAD' ? new Response(null, {status: response.status, headers: response.headers}) : response;
    }
  };
}
