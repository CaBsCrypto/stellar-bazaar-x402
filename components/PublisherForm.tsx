"use client";

import { useMemo, useState } from "react";
import { validateServiceCard } from "@/lib/discovery";
import type { ServiceCard } from "@/lib/types";

const destination = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export function PublisherForm() {
  const [name, setName] = useState("Mi servicio Stellar");
  const [description, setDescription] = useState("Descripción clara del resultado que entrega este servicio.");
  const [kind, setKind] = useState<"http" | "mcp">("http");
  const [url, setUrl] = useState("https://api.example.com");
  const [route, setRoute] = useState("/v1/quote/{pair}");
  const [inputs, setInputs] = useState("pair");
  const [asset, setAsset] = useState("USDC");
  const [amount, setAmount] = useState("0.01");
  const [dest, setDest] = useState(destination);
  const [copied, setCopied] = useState(false);

  const card = useMemo<ServiceCard>(
    () => ({
      version: "bazaar.service-card/v0",
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "draft-service",
      name,
      description,
      kind,
      url,
      routeTemplate: route,
      input: inputs
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((inputName) => ({ name: inputName, type: "string", required: true })),
      network: "stellar:testnet",
      payment: { scheme: "exact", asset, amount, destination: dest },
      provider: { name: "Provider-owned draft" },
      tags: [kind, "community"],
    }),
    [name, description, kind, url, route, inputs, asset, amount, dest],
  );

  const outcomes = validateServiceCard(card);
  const failures = outcomes.filter((outcome) => outcome.status === "fail").length;

  async function copyManifest() {
    await navigator.clipboard?.writeText(JSON.stringify(card, null, 2));
    setCopied(true);
  }

  return (
    <div className="publisher-grid">
      <div className="publisher-form">
        <div className="draft-flag">
          BORRADOR LOCAL · LOCAL DRAFT · NO INDEXADO · NOT INDEXED
        </div>
        <p className="form-help">
          Este formulario no solicita credenciales ni publica directamente. This form never asks for credentials and does not publish directly.
        </p>
        <label>
          Nombre / Name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Descripción / Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="field-row">
          <label>
            Tipo / Kind
            <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="http">HTTP API</option>
              <option value="mcp">MCP tool</option>
            </select>
          </label>
          <label>
            Precio / Price
            <input value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label>
            Asset
            <input value={asset} onChange={(event) => setAsset(event.target.value)} />
          </label>
        </div>
        <label>
          URL base / Base URL
          <input value={url} onChange={(event) => setUrl(event.target.value)} />
        </label>
        <label>
          Route template
          <input value={route} onChange={(event) => setRoute(event.target.value)} />
        </label>
        <label>
          Inputs separados por coma / Comma-separated inputs
          <input value={inputs} onChange={(event) => setInputs(event.target.value)} />
        </label>
        <label>
          Destino público Stellar / Public Stellar destination
          <input value={dest} onChange={(event) => setDest(event.target.value)} />
        </label>
        <button type="button" className="submit-button" disabled={failures > 0} onClick={copyManifest}>
          {copied ? "Manifest copiado / Copied" : "Copiar manifest / Copy manifest"}
        </button>
        <p className="form-help">
          El alta real es append-only, revisada por el operador y sólo server-to-server. Bazaar no recibe fondos ni entrega resultados.
          Registration is append-only, operator-reviewed and server-to-server only. Bazaar never handles funds or provider results.
        </p>
      </div>

      <div>
        <div className={`validation-summary ${failures ? "has-fails" : "ready"}`}>
          <strong>{failures ? `${failures} reglas por corregir / rules to fix` : "Manifest válido para el MVP / MVP-valid manifest"}</strong>
          <span>Valida forma y conformance; no certifica propiedad, seguridad, reputación o disponibilidad.</span>
        </div>
        <div className="outcome-list">
          {outcomes.map((outcome) => (
            <div className={outcome.status} key={outcome.rule}>
              <b>{outcome.status === "pass" ? "✓" : outcome.status === "warning" ? "!" : "×"}</b>
              <span>
                <strong>{outcome.rule}</strong>
                <small>{outcome.reason}</small>
              </span>
            </div>
          ))}
        </div>
        <div className="manifest">
          <div>
            <strong>service-card.json</strong>
            <button type="button" onClick={copyManifest}>Copiar / Copy</button>
          </div>
          <pre>{JSON.stringify(card, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
