"use client";

import {UiText, useUiLanguage} from "@/components/UiLanguage";
import Link from "next/link";
import type {ReactNode} from "react";
import {ButtonLink} from "@/components/ui";
export interface BreadcrumbItem {label:string; href?:string;}
interface BreadcrumbsProps {items:BreadcrumbItem[]; backHref?:string; backLabel?:string; actions?:ReactNode; prefetch?:boolean;}
export function Breadcrumbs({items,backHref="/catalogo",backLabel="← Volver al Catálogo",actions,prefetch = false}:BreadcrumbsProps){
 const {t, language} = useUiLanguage();return <nav className="ui-breadcrumbs" aria-label={t("Navegación secundaria")}><div className="ui-chips">{backHref && <ButtonLink href={backHref} prefetch={prefetch} variant="secondary">{t(backLabel)}</ButtonLink>}<Link href="/" prefetch={prefetch}><UiText text="Inicio"/></Link>{items.map((item,i)=><span key={i}><span aria-hidden="true"> / </span>{item.href && i<items.length-1 ? <Link href={item.href} prefetch={prefetch}>{t(item.label)}</Link>:<span aria-current={i===items.length-1?"page":undefined}>{t(item.label)}</span>}</span>)}</div>{actions}</nav>;}
