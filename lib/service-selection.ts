// Public navigation context only. Never pass access tokens or payment authorizations here.
export function selectedServiceId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : undefined;
}

export function serviceSelectionHref(path: '/hub' | '/open' | '/history' | '/catalogo', value?: unknown): string {
  const id = selectedServiceId(value);
  return id ? `${path}?service=${encodeURIComponent(id)}` : path;
}

export function buyerAgentInstructions(origin: string, value?: unknown): string {
  const id = selectedServiceId(value);
  const selection = id
    ? `El servicio elegido es ${id}. Consulta get_service con ese identificador y vuelve a comprobar la ficha activa, su hash, precio, red, entrega y disponibilidad antes de crear una orden. Si no existe o no está disponible, informa el motivo y detente. Muéstrame las condiciones actuales y solicita mi autorización explícita antes de comprar; este enlace sólo selecciona el servicio y no autoriza un pago.`
    : 'Busca servicios activos con list_market_services o search_services y comprueba la ficha y su hash con get_service. Ayúdame a comparar opciones.';
  return `Conecta con Bazaar por MCP en ${origin}/api/mcp. Consulta get_bazaar_capabilities, tools/list y la skill de comprador ${origin}/skills/buyer/SKILL.md. ${selection} Para comprar, usa mi acceso de agente propio y mi firmante local autorizado: guarda la intención antes de create_market_order, conserva su operationId y usa x402-stellar-exact-v2 con el precio exacto de la ficha activa en USDC oficial de Stellar Testnet, dentro de mi presupuesto autorizado. Comprueba el HTTP 402 contra la ficha antes de firmar. Si falta configuración, saldo gastable o autorización, detente. No crees wallets ni uses faucets automáticamente. Recupera el mismo pedido con get_market_order; nunca repitas un pago incierto. No incluyas credenciales en el prompt.`;
}
