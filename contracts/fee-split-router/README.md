# Bazaar Fee Split Router

Prototipo local y stateless para repartir una compra en dos transferencias atómicas: proveedor y tesorería Bazaar. **No está desplegado, conectado a x402 ni autorizado para Mainnet.**

El contrato no tiene inicialización, administrador, upgrade, retiro ni saldo intermedio. Token, pagador, proveedor, tesorería, monto y comisión forman parte de la solicitud autorizada por el pagador. El único estado durable es el marcador anti-replay.

La comisión admite 1–500 bps; 100 bps es la política predeterminada. El monto debe dividirse exactamente, sin redondeo. Una solicitud expira cuando `expires_ledger <= current_ledger`.

```powershell
cargo test --manifest-path contracts/fee-split-router/Cargo.toml
```

Gate pendiente: el mecanismo `exact` de `@x402/stellar` 2.24.0 solo permite una transferencia SEP-41. Este router no puede desplegarse ni anunciarse como compatible hasta existir un mecanismo/facilitador explícito y pruebas de conformidad.
