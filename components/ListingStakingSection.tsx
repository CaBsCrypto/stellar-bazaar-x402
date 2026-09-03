"use client";

import { useState, useId } from "react";

export type ListingTier = "sandbox" | "verified";

interface ListingStakingSectionProps {
  selectedTier?: ListingTier;
  onTierChange?: (tier: ListingTier) => void;
}

export function ListingStakingSection({
  selectedTier: externalTier,
  onTierChange,
}: ListingStakingSectionProps) {
  const [internalTier, setInternalTier] = useState<ListingTier>("verified");
  const [stakeAmount, setStakeAmount] = useState<number>(250);
  const [baseApy] = useState<number>(8.5); // 8.5% Base APY DeFindex Soroban Vault
  const [copiedCode, setCopiedCode] = useState(false);
  const sliderId = useId();

  const currentTier = externalTier ?? internalTier;

  const handleTierSelect = (tier: ListingTier) => {
    setInternalTier(tier);
    onTierChange?.(tier);
  };

  // Yield calculations (85% Provider / 15% Bazaar + 2% Exit fee)
  const annualGrossYield = stakeAmount * (baseApy / 100);
  const providerAnnualYield = annualGrossYield * 0.85;
  const providerMonthlyYield = providerAnnualYield / 12;
  const bazaarAnnualYield = annualGrossYield * 0.15;
  const exitFee = stakeAmount * 0.02;

  // Discovery priority boost multiplier
  const priorityBoost =
    currentTier === "verified"
      ? Math.min(3.0, 1.5 + (stakeAmount / 500) * 0.5).toFixed(2)
      : "1.00";

  const copySorobanVaultProof = () => {
    const proofText = JSON.stringify(
      {
        protocol: "stellar-bazaar-x402",
        module: "defindex-staking-v1",
        tier: currentTier,
        vault: "CA...DFX_STAKE_VAULT_SOROBAN_TESTNET",
        collateralAsset: "USDC (SEP-0041)",
        stakedAmount: `${stakeAmount} USDC`,
        yieldSplit: { provider: "85%", bazaarTreasury: "15%" },
        exitFeeBps: 200,
        mcpDiscoveryWeight: `${priorityBoost}x`,
      },
      null,
      2
    );
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(proofText);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <section className="staking-section shell" id="modelo-listing">
      <div className="section-heading">
        <div>
          <span className="kicker">ECONOMÍA DE PROVEEDORES · LISTING & STAKING</span>
          <h2>Modelo de Listing & Staking DeFindex</h2>
        </div>
        <p>Alineación de incentivos criptográficos: Calidad garantizada, cero spam y rendimiento pasivo en USDC.</p>
      </div>

      <div className="staking-container">
        {/* Tier Switcher Tabs */}
        <div className="tier-switcher-tabs" role="tablist" aria-label="Selector de Modelo de Listing">
          <button
            type="button"
            role="tab"
            aria-selected={currentTier === "sandbox"}
            className={`tier-tab ${currentTier === "sandbox" ? "active sandbox-tab" : ""}`}
            onClick={() => handleTierSelect("sandbox")}
          >
            <div className="tab-badge">TIER A · EXPERIMENTAL</div>
            <div className="tab-title">
              <span className="dot dot-amber" /> Modo Sandbox Gratuito
            </div>
            <p>Borrador local, sin colateral, ideal para testing y prototipos.</p>
            <div className="tab-tag">0 USDC · Rate Limited</div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={currentTier === "verified"}
            className={`tier-tab ${currentTier === "verified" ? "active verified-tab" : ""}`}
            onClick={() => handleTierSelect("verified")}
          >
            <div className="tab-badge pulse-badge">TIER B · RECOMENDADO AGENTES</div>
            <div className="tab-title">
              <span className="dot dot-mint" /> Verificado con Staking DeFindex
            </div>
            <p>Colateral USDC con generación de Yield 85/15 y prioridad MCP.</p>
            <div className="tab-tag glow-tag">85% APY Provider · Verified Badge ✦</div>
          </button>
        </div>

        {/* Dynamic Tier View */}
        {currentTier === "verified" ? (
          <div className="staking-dashboard">
            <div className="staking-card cyber-card">
              <div className="card-hud-header">
                <div className="hud-title">
                  <span className="cyber-glitch">DEVIATION // VAULT-SOROBAN</span>
                  <h3>Simulador de Staking & Yield DeFindex</h3>
                </div>
                <span className="status-pill status-active">
                  <i /> DeFindex Pool Active
                </span>
              </div>

              <div className="staking-slider-group">
                <div className="slider-label-row">
                  <label htmlFor={sliderId}>Colateral Staked en DeFindex (USDC)</label>
                  <span className="slider-val-display">{stakeAmount.toLocaleString()} USDC</span>
                </div>
                <input
                  id={sliderId}
                  type="range"
                  min="50"
                  max="2000"
                  step="25"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(Number(e.target.value))}
                  className="cyber-range"
                />
                <div className="quick-presets">
                  {[100, 250, 500, 1000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      className={`preset-chip ${stakeAmount === amt ? "active" : ""}`}
                      onClick={() => setStakeAmount(amt)}
                    >
                      {amt} USDC
                    </button>
                  ))}
                </div>
              </div>

              {/* Yield Breakdown Matrix */}
              <div className="yield-matrix">
                <div className="matrix-item highlight">
                  <span className="matrix-label">Yield Anual Proveedor (85%)</span>
                  <strong className="matrix-val mint-text">
                    +{providerAnnualYield.toFixed(2)} USDC <small>/ año</small>
                  </strong>
                  <span className="matrix-sub">~{providerMonthlyYield.toFixed(2)} USDC / mes pasivo</span>
                </div>

                <div className="matrix-item">
                  <span className="matrix-label">Tasa Base DeFindex</span>
                  <strong className="matrix-val">{baseApy.toFixed(1)}% APY</strong>
                  <span className="matrix-sub">Soroban Money Market Vault</span>
                </div>

                <div className="matrix-item">
                  <span className="matrix-label">Bazaar Protocol (15%)</span>
                  <strong className="matrix-val violet-text">
                    +{bazaarAnnualYield.toFixed(2)} USDC
                  </strong>
                  <span className="matrix-sub">Mantenimiento y discovery</span>
                </div>

                <div className="matrix-item">
                  <span className="matrix-label">Exit Fee (Unstake)</span>
                  <strong className="matrix-val amber-text">
                    {exitFee.toFixed(2)} USDC (2%)
                  </strong>
                  <span className="matrix-sub">Defensa anti-Sybil y churn</span>
                </div>
              </div>

              {/* Live Signal Telemetry */}
              <div className="telemetry-bar">
                <div className="telemetry-item">
                  <span>Priority Weight</span>
                  <strong className="mint-text">{priorityBoost}x Prioridad</strong>
                </div>
                <div className="telemetry-item">
                  <span>Status Badge</span>
                  <strong>✦ VERIFIED STAKED</strong>
                </div>
                <div className="telemetry-item">
                  <span>Vault Custody</span>
                  <strong>Non-Custodial Soroban</strong>
                </div>
              </div>
            </div>

            <div className="benefits-card cyber-card">
              <div className="card-hud-header">
                <div className="hud-title">
                  <span className="cyber-glitch">INCENTIVES // PROTOCOL-ALIGNMENT</span>
                  <h3>Beneficios del Staking DeFindex</h3>
                </div>
                <span className="badge-crypto">SOROBAN POWERED</span>
              </div>

              <div className="benefits-grid">
                <div className="benefit-box">
                  <div className="benefit-icon">🚀</div>
                  <div>
                    <h4>Prioridad en Ranking WebMCP</h4>
                    <p>
                      Los agentes autónomos que buscan herramientas en Stellar Bazaar otorgan mayor peso a endpoints con colateral verificado, situándote al inicio del catálogo y del tool routing.
                    </p>
                  </div>
                </div>

                <div className="benefit-box">
                  <div className="benefit-icon">🛡️</div>
                  <div>
                    <h4>Badge Verificado On-Chain</h4>
                    <p>
                      Insignia inmutable indexada directamente en el registry. Genera confianza instantánea para agentes LLM y compradores de APIs que exigen SLAs y disponibilidad real.
                    </p>
                  </div>
                </div>

                <div className="benefit-box">
                  <div className="benefit-icon">💰</div>
                  <div>
                    <h4>85% APY DeFindex Pasivo</h4>
                    <p>
                      Tu colateral no duerme. Los fondos se depositan en bóvedas Soroban de DeFindex, generando yield continuo del cual el 85% se acredita a tu cuenta de proveedor.
                    </p>
                  </div>
                </div>

                <div className="benefit-box">
                  <div className="benefit-icon">🔒</div>
                  <div>
                    <h4>Mecanismo Anti-Sybil (2% Exit Fee)</h4>
                    <p>
                      Una comisión del 2% al des-stakear previene listings efímeros, ataques de spam y garantiza proveedores con compromiso a largo plazo en la red Stellar.
                    </p>
                  </div>
                </div>
              </div>

              <div className="staking-terminal">
                <div className="terminal-header">
                  <span className="dot dot-mint" />
                  <code>soroban://defindex.vault/staking-proof.json</code>
                  <button type="button" onClick={copySorobanVaultProof} className="terminal-copy-btn">
                    {copiedCode ? "Copiado ✓" : "Copiar Proof"}
                  </button>
                </div>
                <pre>
{`{
  "protocol": "stellar-bazaar-x402",
  "tier": "tier_b_verified_staked",
  "defindex_vault": "CA...DFX_STAKE_VAULT_TESTNET",
  "staked_collateral": "${stakeAmount}.00 USDC",
  "yield_distribution": {
    "provider_share": "85%",
    "bazaar_treasury": "15%"
  },
  "exit_fee_bps": 200,
  "ranking_multiplier": "${priorityBoost}x",
  "badge": "VERIFIED_ON_CHAIN"
}`}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <div className="sandbox-dashboard cyber-card">
            <div className="card-hud-header">
              <div className="hud-title">
                <span className="cyber-glitch">MODE // SANDBOX-DRAFT</span>
                <h3>Modo Sandbox Gratuito (Draft Local)</h3>
              </div>
              <span className="status-pill status-amber">
                <i /> Borrador no verificado
              </span>
            </div>

            <div className="sandbox-grid">
              <div className="sandbox-info">
                <h4>Publicación sin riesgo para evaluación y pruebas locales</h4>
                <p>
                  El modo Sandbox te permite estructurar tu <code>ServiceCard</code>, validar la interoperabilidad con WebMCP y probar endpoints HTTP/MCP contra la red Stellar Testnet sin requerir colateral ni pagos previos.
                </p>
                <div className="sandbox-limitations">
                  <div className="limit-item">
                    <span className="limit-icon">⚠️</span>
                    <div>
                      <strong>Rate Limit Estricto</strong>
                      <p>Limitado a 60 peticiones/hora en el catálogo público para prevenir sobrecargas.</p>
                    </div>
                  </div>
                  <div className="limit-item">
                    <span className="limit-icon">⚠️</span>
                    <div>
                      <strong>Ranking Comunitario Estándar</strong>
                      <p>Prioridad base (1.0x). No recibe boost en el algoritmo de búsqueda de agentes autónomos.</p>
                    </div>
                  </div>
                  <div className="limit-item">
                    <span className="limit-icon">⚠️</span>
                    <div>
                      <strong>Sin Generación de Rendimiento</strong>
                      <p>Al no existir colateral en DeFindex, no se genera el 85% de Yield pasivo en USDC.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="sandbox-action-box">
                <div className="sandbox-badge-preview">
                  <span className="badge-draft">✦ DRAFT / SANDBOX</span>
                  <p>Insignia visible en catálogo hasta solicitar verificación.</p>
                </div>
                <div className="upgrade-prompt">
                  <strong>¿Listo para recibir volumen de agentes?</strong>
                  <p>Pasa al Tier Verificado con Staking DeFindex para desbloquear prioridad y rendimiento pasivo.</p>
                  <button
                    type="button"
                    className="upgrade-tier-btn"
                    onClick={() => handleTierSelect("verified")}
                  >
                    Activar Tier Verificado DeFindex →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
