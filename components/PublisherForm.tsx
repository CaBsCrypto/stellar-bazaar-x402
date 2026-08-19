"use client";
import { useMemo, useState } from "react";
import { validateServiceCard } from "@/lib/discovery";
import type { ServiceCard } from "@/lib/types";

const destination = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; id: string; hash: string; revision: number; storage: string }
  | { status: "error"; code: string; message: string; failedRules?: Array<{ rule: string; reason: string }> };

interface RegisteredCard {
  id: string;
  hash: string;
  revision: number;
  card: ServiceCard;
}

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
  const [providerKey, setProviderKey] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
  const [myServices, setMyServices] = useState<RegisteredCard[]>([]);

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
        .map((x) => x.trim())
        .filter(Boolean)
        .map((n) => ({ name: n, type: "string", required: true })),
      network: "stellar:testnet",
      payment: { scheme: "exact", asset, amount, destination: dest },
      provider: { name: "Provider-owned draft" },
      tags: [kind, "community"],
    }),
    [name, description, kind, url, route, inputs, asset, amount, dest],
  );

  const outcomes = validateServiceCard(card);
  const fails = outcomes.filter((x) => x.status === "fail").length;

  async function loadMyServices(key: string) {
    if (!key.trim()) return;
    const res = await fetch("/api/publisher/ingest", {
      headers: { "X-Bazaar-Provider-Key": key.trim() },
    });
    if (res.ok) {
      const data = await res.json();
      setMyServices(data.services ?? []);
    } else {
      setMyServices([]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitState({ status: "submitting" });
    try {
      const res = await fetch("/api/publisher/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(providerKey.trim() ? { "X-Bazaar-Provider-Key": providerKey.trim() } : {}),
        },
        body: JSON.stringify(card),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitState({
          status: "success",
          id: data.id,
          hash: data.hash,
          revision: data.revision,
          storage: data.storage,
        });
        await loadMyServices(providerKey);
      } else {
        setSubmitState({
          status: "error",
          code: data.error?.code ?? "UNKNOWN",
          message: data.error?.message ?? "Error al registrar el servicio.",
          failedRules: data.error?.failedRules,
        });
      }
    } catch {
      setSubmitState({
        status: "error",
        code: "NETWORK_ERROR",
        message: "No se pudo conectar con el Bazaar.",
      });
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/publisher/ingest/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "X-Bazaar-Provider-Key": providerKey.trim() },
    });
    if (res.ok) {
      setMyServices((prev) => prev.filter((s) => s.id !== id));
    }
  }

  return (
    <div className="publisher-grid">
      <form className="publisher-form" onSubmit={handleSubmit}>
        <div className="draft-flag">REGISTRO EN EL BAZAAR · VALIDADO E INDEXADO · PERSISTIDO EN UPSTASH REDIS</div>
        <label>
          Nombre
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Descripción
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="field-row">
          <label>
            Tipo
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="http">HTTP API</option>
              <option value="mcp">MCP tool</option>
            </select>
          </label>
          <label>
            Precio propio
            <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            Asset
            <input value={asset} onChange={(e) => setAsset(e.target.value)} />
          </label>
        </div>
        <label>
          URL base
          <input value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label>
          Route template
          <input value={route} onChange={(e) => setRoute(e.target.value)} />
        </label>
        <label>
          Inputs separados por coma
          <input value={inputs} onChange={(e) => setInputs(e.target.value)} />
        </label>
        <label>
          Destino público Stellar (provider-owned)
          <input value={dest} onChange={(e) => setDest(e.target.value)} />
        </label>
        <label>
          Provider key (BAZAAR_PROVIDER_SECRET)
          <input
            type="password"
            value={providerKey}
            onChange={(e) => setProviderKey(e.target.value)}
            placeholder="Obligatoria en producción; opcional en dev"
          />
        </label>
        <button type="submit" className="submit-button" disabled={submitState.status === "submitting" || fails > 0}>
          {submitState.status === "submitting" ? "Registrando…" : "Registrar en el Bazaar"}
        </button>
        <p className="form-help">
          Tú defines precio, asset, destino y términos. Bazaar no recibe fondos ni entrega el resultado de tu servicio.
        </p>

        {submitState.status === "success" && (
          <div className="submit-panel success">
            <strong>✓ Registrado</strong>
            <span>id: {submitState.id} · revision: {submitState.revision} · storage: {submitState.storage}</span>
            <code>{submitState.hash}</code>
            <small>Visible en <a href="/api/discovery/resources">/api/discovery/resources</a> y MCP search_services.</small>
          </div>
        )}

        {submitState.status === "error" && (
          <div className="submit-panel error">
            <strong>× {submitState.code}</strong>
            <span>{submitState.message}</span>
            {submitState.failedRules && submitState.failedRules.length > 0 && (
              <ul className="failed-rules">
                {submitState.failedRules.map((rule) => (
                  <li key={rule.rule}>
                    <b>{rule.rule}</b> — {rule.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>

      <div>
        <div className={`validation-summary ${fails ? "has-fails" : "ready"}`}>
          <strong>{fails ? `${fails} reglas por corregir` : "Manifest válido para el MVP"}</strong>
          <span>Esto valida forma y conformance; no certifica seguridad, reputación o disponibilidad.</span>
        </div>
        <div className="outcome-list">
          {outcomes.map((o) => (
            <div className={o.status} key={o.rule}>
              <b>{o.status === "pass" ? "✓" : o.status === "warning" ? "!" : "×"}</b>
              <span>
                <strong>{o.rule}</strong>
                <small>{o.reason}</small>
              </span>
            </div>
          ))}
        </div>
        <div className="manifest">
          <div>
            <strong>service-card.json</strong>
            <button type="button" onClick={() => navigator.clipboard?.writeText(JSON.stringify(card, null, 2))}>
              Copiar
            </button>
          </div>
          <pre>{JSON.stringify(card, null, 2)}</pre>
        </div>

        {myServices.length > 0 && (
          <div className="manifest">
            <div>
              <strong>Tus servicios registrados ({myServices.length})</strong>
            </div>
            {myServices.map((service) => (
              <div className="my-service" key={service.id}>
                <span>
                  <b>{service.id}</b> · rev {service.revision}
                </span>
                <button type="button" onClick={() => handleDelete(service.id)}>
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}