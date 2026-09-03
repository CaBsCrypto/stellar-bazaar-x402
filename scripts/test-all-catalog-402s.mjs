import { createServer } from "node:http";
import next from "next";

const app = next({ dev: true, hostname: "127.0.0.1", port: 3042 });
const handle = app.getRequestHandler();

async function main() {
  console.log("=================================================================");
  console.log("🧪 [VALIDATION] Testing all 4 x402 Endpoints in Next.js Server");
  console.log("=================================================================\n");

  await app.prepare();
  const server = createServer((req, res) => handle(req, res));
  await new Promise((resolve) => server.listen(3042, "127.0.0.1", resolve));
  console.log("✓ Next.js Test Server running at http://127.0.0.1:3042\n");

  const endpoints = [
    {
      name: "1. Swap Risk Quote",
      path: "/api/x402/swap-risk?pair=XLM%2FUSDC&amount=1000&side=buy",
      expectedPrice: "0.001",
    },
    {
      name: "2. Stellar Ledger Brief",
      path: "/api/x402/ledger-brief?address=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5&window=24h",
      expectedPrice: "0.005",
    },
    {
      name: "3. Soroban Contract Safety Scan",
      path: "/api/x402/contract-safety?contractId=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC&network=testnet",
      expectedPrice: "0.010",
    },
    {
      name: "4. Market Window DEX Depth",
      path: "/api/x402/market-window?pair=XLM%2FUSDC&depth=5",
      expectedPrice: "0.002",
    },
  ];

  let passed = 0;

  for (const ep of endpoints) {
    console.log(`▶ Testing ${ep.name}...`);
    const res = await fetch(`http://127.0.0.1:3042${ep.path}`);
    const status = res.status;
    const requiredHeader = res.headers.get("payment-required");
    const json = await res.json();

    if (status === 402 && requiredHeader) {
      console.log(`  ✓ Received HTTP 402 Payment Required`);
      console.log(`  ✓ PAYMENT-REQUIRED Header present: ${requiredHeader.slice(0, 45)}...`);
      console.log(`  ✓ Service requirements accepted: ${JSON.stringify(json.accepts?.[0]?.extra ?? json.accepts?.[0] ?? {})}\n`);
      passed++;
    } else {
      console.error(`  ✗ FAILED: Expected 402 but got ${status}`, json);
    }
  }

  // Also test /catalogo redirect
  console.log("▶ Testing /catalogo Redirect...");
  const redirectRes = await fetch("http://127.0.0.1:3042/catalogo", { redirect: "manual" });
  if (redirectRes.status === 308 && redirectRes.headers.get("location")?.includes("/#catalogo")) {
    console.log("  ✓ /catalogo correctly redirects with 308 to /#catalogo\n");
    passed++;
  } else {
    console.error(`  ✗ FAILED /catalogo redirect: status ${redirectRes.status}`);
  }

  server.close();

  console.log("=================================================================");
  if (passed === 5) {
    console.log("🎉 ALL 5 LIVE CALLS VALIDATED WITH 100% SUCCESS!");
  } else {
    console.error(`⚠️ ${passed}/5 passed. Check logs.`);
    process.exit(1);
  }
  console.log("=================================================================");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error in test suite:", err);
  process.exit(1);
});
