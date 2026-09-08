"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { DeliveryFile, SavedDeliverable } from "@/lib/deliverable";

import type { ActivityEvent } from "@/lib/activity";

import {
  PurchaseWorkspace,
  ReadableLegacy,
  OriginalResult,
  type PurchaseRecord,
  type FileAccess,
} from "./DeliverableViewer";

export function PrivatePurchase({
  record,
  token,
  events,
  onUnauthorized,
  legacyDownload,
}: {
  record: PurchaseRecord;
  token: string;
  events: ActivityEvent[];
  onUnauthorized?: () => void;
  legacyDownload: ReactNode;
}) {
  const [versions, setVersions] = useState<SavedDeliverable[]>([]),
    [selectedId, setSelectedId] = useState<string>(),
    [notice, setNotice] = useState(""),
    generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    let busy = false;
    setVersions([]);
    setSelectedId(undefined);
    setNotice("");

    async function load() {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch(
          "/api/deliveries?operationId=" +
            encodeURIComponent(record.clientOperationId),
          {
            headers: { Authorization: "Bearer " + token },
            cache: "no-store",
            credentials: "omit",
            redirect: "error",
            signal: controller.signal,
          },
        );
        if (current !== generation.current) return;
        if (res.status === 401 || res.status === 403) {
          onUnauthorized?.();
          return;
        }
        if (!res.ok) throw Error();
        const body = await res.json();
        if (current !== generation.current) return;
        if (!Array.isArray(body.versions)) throw Error();
        setVersions(body.versions);
        setNotice(
          body.limits
            ? `Almacenamiento: ${(body.limits.usedBytes / 1e9).toFixed(2)} de 5 GB reservados · máximo 500 MB por archivo.${body.limits.usedBytes >= body.limits.ownerBytes ? " Límite alcanzado: no se pueden guardar nuevos archivos." : ""}`
            : "",
        );
      } catch {
        if (current === generation.current)
          setNotice(
            "No se pudo consultar la biblioteca de archivos. El resultado registrado de la compra sigue disponible abajo.",
          );
      } finally {
        busy = false;
      }
    }

    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);

    return () => {
      generation.current++;
      controller.abort();
      clearInterval(timer);
    };
  }, [record.clientOperationId, token, onUnauthorized]);

  const selected = Math.max(
    0,
    versions.findIndex((v) => v.manifest.versionId === selectedId),
  );

  const versionId = versions[selected]?.manifest.versionId;

  const access: FileAccess = useCallback(
    async (file, download, signal) => {
      const current = generation.current;
      const res = await fetch("/api/deliveries/access", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ versionId, fileId: file.id, download }),
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal,
      });
      if (current !== generation.current) throw Error();
      if (res.status === 401 || res.status === 403) onUnauthorized?.();
      if (!res.ok) throw Error();
      const data = await res.json();
      if (current !== generation.current) throw Error();
      return data;
    },
    [versionId, token, onUnauthorized],
  );

  async function download(file: DeliveryFile) {
    try {
      const response = await access(file, true);
      const link = document.createElement("a");
      link.href = response.url;
      link.download = file.name;
      link.rel = "noopener noreferrer";
      link.click();
    } catch {
      setNotice(
        "No se pudo acceder al archivo. No se ha realizado ningún nuevo cobro.",
      );
    }
  }

  return (
    <PurchaseWorkspace
      record={record}
      versions={versions}
      selected={Math.min(selected, Math.max(versions.length - 1, 0))}
      onVersion={(index) => setSelectedId(versions[index]?.manifest.versionId)}
      access={access}
      onDownload={(file) => void download(file)}
      events={events}
      notice={notice}
      legacy={
        <section className="legacy-delivery">
          <p className="delivery-state">
            Entrega anterior · contenido conservado
          </p>
          {record.delivery.result !== undefined ? (
            <>
              <ReadableLegacy value={record.delivery.result} />
              <OriginalResult value={record.delivery.result} />
            </>
          ) : (
            <p>No hay contenido estructurado conservado para esta compra.</p>
          )}
          {legacyDownload}
        </section>
      }
    />
  );
}
