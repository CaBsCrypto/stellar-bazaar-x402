"use client";

import { useMemo, useRef, useState } from "react";
import { validateServiceCard } from "@/lib/discovery";
import type { ServiceCard } from "@/lib/types";
import { ProviderReviewControls } from "./ProviderReviewControls";

const destination = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export function PublisherForm({ reception = "closed" }: { reception?: "open" | "closed" | "unavailable" }) {
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
  const [copyError, setCopyError] = useState(false);
  const manifestRef = useRef<HTMLTextAreaElement>(null);
  const [proofMethod, setProofMethod] = useState<"dns-txt" | "http-well-known">("dns-txt");
  const [proofDomain, setProofDomain] = useState("api.example.com");

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
    setCopied(false);
    setCopyError(false);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(JSON.stringify(card, null, 2));
      setCopied(true);
    } catch {
      setCopyError(true);
      manifestRef.current?.focus();
      manifestRef.current?.select();
    }
  }

  return (
    <div className="publisher-grid">
      <div className="publisher-form">
        <div className="draft-flag">
          BORRADOR LOCAL · LOCAL DRAFT · NO INDEXADO · NOT INDEXED
        </div>
        <p className="form-help">
          Prepara una ficha sin claves administrativas ni de wallet. La solicitud usa un acceso privado propio y no publica directamente.
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
        <fieldset>
          <legend>Prueba de control / Control proof</legend>
          <p className="form-help">Recibir un challenge no verifica el dominio. El operador debe comprobar la prueba del mismo hostname antes de revisar el servicio.</p>
          <div className="field-row">
            <label>
              Método / Method
              <select value={proofMethod} onChange={(event) => setProofMethod(event.target.value as typeof proofMethod)}>
                <option value="dns-txt">DNS TXT</option>
                <option value="http-well-known">HTTP .well-known</option>
              </select>
            </label>
            <label>
              Dominio exacto / Exact domain
              <input value={proofDomain} onChange={(event) => setProofDomain(event.target.value)} />
            </label>
          </div>
        </fieldset>
        <ProviderReviewControls card={card} method={proofMethod} domain={proofDomain} disabled={failures > 0} />
        <p className="form-help">
          {reception === "open"
            ? "Recepción abierta: guarda tu acceso privado antes de enviar. La solicitud se conserva en almacenamiento compartido para verificar el dominio y recibir revisión manual. Enviar, aprobar o preparar no activa el servicio."
            : reception === "unavailable"
              ? "La recepción no está disponible por un problema de configuración del almacenamiento. Puedes preparar tu ficha; no envíes una nueva solicitud para resolver un error de recuperación."
              : "Recepción cerrada: puedes preparar tu ficha y conservarla. Las solicitudes enviadas anteriormente siguen disponibles mediante su acceso privado."}
          {" "}Los pagos permanecen deshabilitados. No compartas claves de wallet ni credenciales administrativas.
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
          <textarea ref={manifestRef} aria-label="Manifest del servicio para copiar" readOnly value={JSON.stringify(card, null, 2)} rows={16} onFocus={(event) => event.currentTarget.select()} style={{ width: "100%", boxSizing: "border-box" }} />
          <p role="status">{copyError ? "No se pudo copiar. El texto está seleccionado para copiarlo manualmente." : copied ? "Manifest copiado. Esto no envía ni publica el servicio." : ""}</p>
        </div>
      </div>
    </div>
  );
}
