# 🐍 Python AI Agent Integration · LangChain, CrewAI & AutoGen on Stellar Bazaar x402

This guide explains how to connect autonomous AI agents written in **Python** (LangChain, LangGraph, CrewAI, AutoGen, or standalone scripts) to **Stellar Bazaar x402** to dynamically discover, inspect, and pay for APIs using **USDC micropayments on Stellar**.

---

## 🏗️ Architectural Flow

```
┌─────────────────┐       1. search_services("swap risk")        ┌────────────────────────┐
│  Python Agent   │ ───────────────────────────────────────────> │  Stellar Bazaar (MCP)  │
│ (LangChain/Crew)│ <─────────────────────────────────────────── │  /api/mcp or REST API  │
└────────┬────────┘         2. ServiceCard (Price: 0.001 USDC)   └────────────────────────┘
         │
         │ 3. GET /api/x402/swap-risk... (unpaid)
         ▼
┌─────────────────┐         4. HTTP 402 PAYMENT-REQUIRED          ┌────────────────────────┐
│   Provider API  │ ───────────────────────────────────────────> │      Python Agent      │
│   (x402 Server) │ <─────────────────────────────────────────── │  (Signs with Ed25519)  │
└────────┬────────┘      5. GET with PAYMENT-SIGNATURE header     └────────────────────────┘
         │
         │ 6. Verify & Settle on Stellar Blockchain
         ▼
┌─────────────────┐
│ Stellar Ledger  │ (Instant on-chain settlement, sub-cent fee: $0.00001)
└─────────────────┘
```

---

## 📦 Prerequisites

Install the official Stellar Python SDK and LangChain dependencies:

```bash
pip install stellar-sdk requests langchain-core
```

---

## 🚀 1. LangChain Custom Tool Integration

```python
import os
import json
import base64
import requests
from langchain.tools import tool
from stellar_sdk import Keypair

BAZAAR_URL = os.getenv("BAZAAR_BASE_URL", "https://stellar-bazaar-x402.vercel.app")
PAYER_SECRET = os.getenv("X402_PAYER_SECRET")  # ignored server-side env only

@tool
def execute_stellar_bazaar_service(path_with_query: str) -> dict:
    """
    Executes a paid service on Stellar Bazaar x402.
    Handles the HTTP 402 challenge and settles payment on Stellar Testnet.
    
    Args:
        path_with_query: The endpoint path and query parameters (e.g. '/api/x402/swap-risk?pair=XLM/USDC&amount=2500&side=buy')
    """
    url = f"{BAZAAR_URL}{path_with_query}"
    
    # 1. Initial Request (triggers HTTP 402 challenge)
    res = requests.get(url)
    if res.status_code == 200:
        return res.json()
        
    if res.status_code != 402:
        return {"error": f"Unexpected status {res.status_code}", "body": res.text}
        
    # 2. Extract 402 Requirements
    raw_header = res.headers.get("PAYMENT-REQUIRED")
    if not raw_header:
        challenge = res.json()
    else:
        challenge = json.loads(base64.b64decode(raw_header).decode("utf-8"))
        
    requirements = challenge["accepts"][0]
    
    # 3. Sign the payment authorization locally (No custody leak)
    keypair = Keypair.from_secret(PAYER_SECRET)
    
    # Construct payment authorization payload
    payload = {
        "network": requirements["network"],
        "scheme": requirements["scheme"],
        "payTo": requirements["payTo"],
        "asset": requirements["asset"],
        "amount": requirements["amount"],
        "payer": keypair.public_key,
        "nonce": os.urandom(16).hex(),
    }
    
    msg_bytes = json.dumps(payload, sort_keys=True).encode("utf-8")
    signature = keypair.sign(msg_bytes)
    
    signed_header = base64.b64encode(json.dumps({
        "payload": payload,
        "signature": base64.b64encode(signature).decode("utf-8")
    }).encode("utf-8")).decode("utf-8")
    
    # 4. Fulfill challenge with PAYMENT-SIGNATURE
    paid_res = requests.get(url, headers={"PAYMENT-SIGNATURE": signed_header})
    
    return paid_res.json()
```

---

## 👥 2. CrewAI Agent Integration

```python
from crewai import Agent, Task, Crew
from langchain.tools import tool

@tool("Search Stellar Bazaar")
def search_bazaar(query: str) -> list:
    """Searches Stellar Bazaar catalog for machine-readable APIs."""
    res = requests.get(f"https://stellar-bazaar-x402.vercel.app/api/discovery/search?q={query}")
    return res.json().get("results", [])

# Define CrewAI Agent equipped with Stellar Bazaar capabilities
analyst_agent = Agent(
    role="Crypto Market Analyst",
    goal="Analyze swap risk and liquidity across Stellar DEX in real time",
    backstory="You are an autonomous AI agent with a Stellar wallet capable of purchasing DeFi risk metrics.",
    tools=[search_bazaar, execute_stellar_bazaar_service],
    verbose=True
)
```

---

## 🔒 Security Best Practices for Python Agents

1. **Strict Local Key Custody:** Never pass `PAYER_SECRET` in prompt contexts or system messages. Only the execution tool should access the environment variable.
2. **Pre-flight Budget Verification:** Check `requirements["amount"]` against agent budget thresholds before signing.
3. **Deterministic Error Handling:** Check for standard error envelopes (`RESOURCE_NOT_FOUND`, `PAYMENT_EXPIRED`, `INVALID_SIGNATURE`).
