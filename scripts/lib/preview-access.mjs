// Server-side transport. Never persist this credential in a report or forward redirects.
export function createPreviewFetch(origin, token, fetchImpl = fetch) {
 const approved = new URL(origin);
 if (approved.protocol !== 'https:' || approved.origin !== origin || !approved.hostname.endsWith('.vercel.app')) throw Error('INVALID_PREVIEW_ORIGIN');
 if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) throw Error('PREVIEW_ACCESS_REQUIRED');
 return async (input, init = {}) => {
  const request = input instanceof Request ? input : null;
  const url = new URL(request ? request.url : String(input));
  if (url.origin !== origin || url.username || url.password) throw Error('PREVIEW_ORIGIN_MISMATCH');
  const headers = new Headers(init.headers ?? request?.headers);
  headers.set('x-vercel-protection-bypass', token);
  const response = await fetchImpl(input, { ...init, headers, redirect:'error' });
  if (response.status >= 300 && response.status < 400) throw Error('PREVIEW_REDIRECT_REFUSED');
  return response;
 };
}
