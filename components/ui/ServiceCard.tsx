import Link from "next/link";
import type {RankedService} from "@/lib/types";
import {Pill} from "./index";
export function ServiceCard({service, score, reasons, showScore, highlighted}: RankedService & {showScore: boolean; highlighted: boolean}) {
 return <Link href={`/resources/${service.id}`} aria-label={`Ver condiciones y detalle de ${service.name}`} id={`service-card-${service.id}`} className={`ui-card ui-service-card ${highlighted ? "is-highlighted" : ""}`}>
  <div className="ui-card-meta"><Pill tone="info">Listado en Testnet</Pill><span className="ui-mono">{service.kind.toUpperCase()}</span></div>
  <p className="kicker">{service.provider}</p><h3>{service.name}</h3><p>{service.description}</p>
  {showScore && <div className="ui-score"><strong>Coincidencia: {score}</strong><p>{reasons.slice(0,2).join(" · ")}</p></div>}
  <div className="ui-chips">{service.tags.slice(0,3).map(tag => <span className="ui-chip" key={tag}>#{tag}</span>)}</div>
  <div className="ui-service-price"><strong>{service.payment.amount} {service.payment.asset}</strong><span>de Testnet · {service.payment.scheme}</span></div>
  <span className="ui-detail-link">Ver condiciones y detalle →</span>
 </Link>;
}
