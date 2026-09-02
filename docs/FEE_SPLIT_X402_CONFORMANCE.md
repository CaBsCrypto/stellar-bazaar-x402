# Gate de conformidad x402 para comisión / Fee-split x402 conformance gate

Estado: **diseño local, no compatible con `exact`, no desplegado y sin pagos**.

## Resultado de la auditoría

El stack fijado usa `@x402/stellar` 2.24.0. Su flujo `exact`:

1. anuncia un único `payTo`, activo y monto;
2. construye una sola llamada SEP-41 `transfer(payer, payTo, amount)`;
3. exige que el contrato invocado sea el activo y la función sea `transfer`;
4. rechaza simulaciones con más de una transferencia.

El router no puede ocultarse detrás de `payTo`: eso transferiría el bruto al balance del contrato sin ejecutar `split`. Dos pagos separados tampoco son atómicos.

## Contrato experimental local

`bazaar-stellar-split/v0` es únicamente un sobre interno para probar invariantes. Lleva red, SAC, router, bruto, basis points, hash de política, binding y dos asignaciones exactas. Siempre declara `standardExactCompatible: false`.

No es una extensión publicada, un esquema upstream ni una capacidad del facilitador OpenZeppelin. No debe aparecer en una respuesta `402` pública.

## Condiciones para pasar a Testnet

- especificación versionada revisada del mecanismo y sus errores;
- cliente que construya una invocación `split(request)` y autorización completa;
- verificador que inspeccione contrato, función, argumentos, auth tree, expiración y replay;
- settle que use el facilitador sin reimplementar ni debilitar sus garantías;
- `/supported` que anuncie el mecanismo únicamente cuando exista soporte real;
- corpus de conformidad positivo/negativo compartido entre cliente, servidor y facilitador;
- revisión independiente y autorización separada antes de desplegar o pagar.

Hasta entonces, Website Intelligence sigue usando `exact` con pago directo 100% al proveedor.
