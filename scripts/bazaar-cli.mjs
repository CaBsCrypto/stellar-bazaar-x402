#!/usr/bin/env node

/**
 * scripts/bazaar-cli.mjs
 *
 * Official Stellar Bazaar Provider CLI:
 * Allows developers and agents to validate their ServiceCard, test x402 payment splits,
 * and package deliverables before listing on the marketplace.
 *
 * Usage:
 *   node scripts/bazaar-cli.mjs validate <path-to-card.json>
 *   node scripts/bazaar-cli.mjs split <amount-usdc>
 *   node scripts/bazaar-cli.mjs init
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { validateServiceCard } from "../lib/discovery.ts";
import { generateCanonicalServiceCard, computeServiceCardHash } from "../lib/provider-kit/index.ts";

const [, , command, arg1] = process.argv;

console.log("==========================================================");
console.log("✦ Stellar Bazaar Provider CLI — x402 Standardization Tool");
console.log("==========================================================\n");

if (!command || command === "help" || command === "--help") {
  console.log("Comandos disponibles:");
  console.log("  bazaar-cli init                     Genera una plantilla service-config.json");
  console.log("  bazaar-cli validate <card.json>     Valida conformidad con el estándar del Bazaar");
  console.log("  bazaar-cli split <amount-usdc>      Calcula la división 99/1 o 97/3 de comisiones");
  console.log("\nEjemplo: node scripts/bazaar-cli.mjs init");
  process.exit(0);
}

if (command === "init") {
  const template = {
    id: "my-custom-ai-service",
    name: "My Custom AI Service",
    description: "High-performance AI microservice monetized with Stellar x402.",
    tags: ["ai", "data", "analysis"],
    pricing: {
      amountUsdc: "0.01",
      scheme: "split-exact",
      destinationAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      feeBps: 100,
    },
    endpointUrl: "https://myservice.example.com/api/x402/execute",
    routeTemplate: "/api/x402/execute",
    input: [
      {
        name: "prompt",
        type: "string",
        required: true,
      },
    ],
    provider: {
      name: "My Org / Agent",
      website: "https://myservice.example.com",
    },
  };

  const filename = arg1 ?? "service-config.json";
  if (existsSync(filename)) {
    console.log(`⚠️ El archivo "${filename}" ya existe. No se sobrescribió.`);
  } else {
    writeFileSync(filename, JSON.stringify(template, null, 2), "utf-8");
    console.log(`✓ Plantilla creada exitosamente: "${filename}"`);
    console.log(`✓ Puedes validarla ejecutando: node scripts/bazaar-cli.mjs validate ${filename}`);
  }
} else if (command === "validate") {
  const filepath = arg1 ?? "service-config.json";
  if (!existsSync(filepath)) {
    console.error(`❌ Archivo no encontrado: ${filepath}`);
    process.exit(1);
  }

  try {
    const raw = JSON.parse(readFileSync(filepath, "utf-8"));
    const card = raw.version ? raw : generateCanonicalServiceCard(raw);
    const outcomes = validateServiceCard(card);
    const failures = outcomes.filter((o) => o.status === "fail");
    const warnings = outcomes.filter((o) => o.status === "warning");

    console.log(`Analizando "${card.name}" (${card.id})...`);
    console.log(`URL: ${card.url}`);
    console.log(`Precio: ${card.payment.amount} ${card.payment.asset} via ${card.payment.scheme}\n`);

    if (failures.length > 0) {
      console.error("❌ ERRORES DE CONFORMIDAD:");
      failures.forEach((f) => console.error(`  - [${f.rule}] ${f.reason}`));
      process.exit(1);
    }

    if (warnings.length > 0) {
      console.warn("⚠️ ADVERTENCIAS:");
      warnings.forEach((w) => console.warn(`  - [${w.rule}] ${w.reason}`));
    }

    const cardHash = computeServiceCardHash(card);
    console.log(`✓ CONFORMIDAD APROBADA (0 errores).`);
    console.log(`✓ Hash canónico SHA-256: ${cardHash}`);
    console.log(`✓ Listo para publicación en Stellar Bazaar x402.`);
  } catch (err) {
    console.error(`❌ Error al procesar el archivo: ${err.message}`);
    process.exit(1);
  }
} else if (command === "split") {
  const amount = parseFloat(arg1 ?? "0.01");
  if (isNaN(amount) || amount <= 0) {
    console.error("❌ Monto inválido. Especifica un decimal positivo en USDC (ej: 0.05).");
    process.exit(1);
  }

  const atomic = BigInt(Math.round(amount * 10_000_000));
  const feeAtomic = (atomic * 100n) / 10_000n; // 1%
  const providerAtomic = atomic - feeAtomic;

  console.log(`Monto bruto: ${amount.toFixed(7)} USDC (${atomic} atomic units)`);
  console.log(`💼 Proveedor (99%): ${(Number(providerAtomic) / 10_000_000).toFixed(7)} USDC`);
  console.log(`🏛️ Tesorería Bazaar (1%): ${(Number(feeAtomic) / 10_000_000).toFixed(7)} USDC`);
  console.log(`✓ Reparto Soroban atómico y exacto sin pérdidas de redondeo.`);
}
