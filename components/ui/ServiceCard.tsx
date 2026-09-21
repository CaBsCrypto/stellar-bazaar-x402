import Link from "next/link";
import type {RankedService} from "@/lib/types";
import {Pill} from "./index";
export function ServiceCard({service, score, reasons, showScore, highlighted, onTag}: RankedService & {showScore: boolean; highlighted: boolean; onTag: (tag: string) => void}) {
 return <article id={`service-card-${service.id}`} className={`ui-card ui-service-card ${highlighted ? "is-highlighted" : ""}`}>
  <div className="ui-card-meta"><Pill tone="info">Listado en Testnet</Pill><span className="ui-mono">{service.kind.toUpperCase()}</span></div>
  <p className="kicker">{service.provider}</p><h3><Link href={`/resources/${service.id}`}>{service.name}</Link></h3><p>{service.description}</p>
  {showScore && <div className="ui-score"><strong>Coincidencia: {score}</strong><p>{reasons.slice(0,2).join(" · ")}</p></div>}
  <div className="ui-chips">{service.tags.slice(0,3).map(tag => <button type="button" className="ui-chip" key={tag} onClick={() => onTag(tag)} aria-label={`Filtrar por ${tag}`}>#{tag}</button>)}</div>
  <div className="ui-service-price"><strong>{service.payment.amount} {service.payment.asset}</strong><span>de Testnet · {service.payment.scheme}</span></div>
  <Link className="ui-detail-link" href={`/resources/${service.id}`}>Ver condiciones y detalle →</Link>
 </article>;
}
