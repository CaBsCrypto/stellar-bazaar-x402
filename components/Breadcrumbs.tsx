import Link from "next/link";
import type {ReactNode} from "react";
import {ButtonLink} from "@/components/ui";
export interface BreadcrumbItem {label:string; href?:string;}
interface BreadcrumbsProps {items:BreadcrumbItem[]; backHref?:string; backLabel?:string; actions?:ReactNode;}
export function Breadcrumbs({items,backHref="/catalogo",backLabel="← Volver al Catálogo",actions}:BreadcrumbsProps){return <nav className="ui-breadcrumbs" aria-label="Navegación secundaria"><div className="ui-chips">{backHref && <ButtonLink href={backHref} variant="secondary">{backLabel}</ButtonLink>}<Link href="/">Inicio</Link>{items.map((item,i)=><span key={i}><span aria-hidden="true"> / </span>{item.href && i<items.length-1 ? <Link href={item.href}>{item.label}</Link>:<span aria-current={i===items.length-1?"page":undefined}>{item.label}</span>}</span>)}</div>{actions}</nav>;}
