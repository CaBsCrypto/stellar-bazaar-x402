"use client";
import { useState } from "react";
import type { PaidService } from "@/lib/types";
import { PaymentDemo } from "./PaymentDemo";
import { TestnetPaymentDemo } from "./TestnetPaymentDemo";
export function ServicePortfolioTools({service}: {service: PaidService}) {
  const [open,setOpen]=useState(false);
  return <details className="portfolio-technical" onToggle={event=>setOpen(event.currentTarget.open)}><summary>Herramientas de prueba y pago · Testnet</summary><p>Son herramientas separadas de la muestra ilustrativa. Abrir esta sección no ejecuta un pago.</p>{open && <><PaymentDemo service={service}/><TestnetPaymentDemo/></>}</details>;
}
