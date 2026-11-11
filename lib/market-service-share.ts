/** Public discovery links carry only a reviewed service ID, never account access. */
export function publicServicePath(serviceId: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(serviceId) || serviceId.length > 100) throw new Error('INVALID_SERVICE_ID');
  return `/resources/${serviceId}`;
}

export function publicServiceUrl(origin: string, serviceId: string): string {
  const url = new URL(origin);
  if (url.origin !== origin || url.username || url.password || url.search || url.hash ||
      !(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('INVALID_PUBLIC_ORIGIN');
  }
  return origin + publicServicePath(serviceId);
}
