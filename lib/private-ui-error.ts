/** Browser-only presentation. Does not choose an API, retry or persist access. */
export class PrivateUiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfterSeconds: number | undefined;
  constructor(code: string, status: number, retryAfter: string | null) {
    super(code);
    this.code = code;
    this.status = status;
    if (retryAfter && /^\d{1,5}$/.test(retryAfter)) {
      const seconds = Number(retryAfter);
      if (seconds > 0 && seconds <= 86400) this.retryAfterSeconds = seconds;
    }
  }
}
export function privateUiError(response: Pick<Response, 'status' | 'headers'>, value: unknown) {
  const candidate = value && typeof value === 'object' && 'error' in value ? (value as {error?: {code?: unknown}}).error?.code : undefined;
  const code = typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{2,95}$/.test(candidate) ? candidate : 'REQUEST_FAILED';
  return new PrivateUiError(code, response.status, response.headers.get('retry-after'));
}
export function privateUiMessage(error: unknown, knownMessages: readonly string[] = []) {
  if (error instanceof PrivateUiError) {
    if (error.status === 401) return 'El acceso ya no es válido. Recupera el acceso vigente de tu mismo espacio.';
    if (/BUDGET|REQUEST_LIMIT|RATE_LIMIT|QUOTA|TRANSPORT_CAPACITY/.test(error.code)) return 'La consulta está limitada por la capacidad disponible. Conserva tu pedido y espera antes de actualizar manualmente.';
    if (error.status === 503) return 'Tu espacio no está disponible en este momento. Conserva tu archivo y el comprobante del pedido.';
    if (error.status === 403) return 'Este acceso no permite esa acción. Conserva tu espacio y comprueba qué acceso estás usando.';
    return 'No se pudo confirmar esta consulta. Conserva el identificador del pedido.';
  }
  return error instanceof Error && knownMessages.includes(error.message)
    ? error.message : 'No se pudo confirmar esta consulta. Conserva el identificador del pedido.';
}
