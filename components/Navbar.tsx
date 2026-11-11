"use client";
import {UiText, useUiLanguage, LanguageSwitch} from "@/components/UiLanguage";

import Link from "next/link";
import {useEffect, useState} from "react";
import {usePathname} from "next/navigation";
import {Button, Pill} from "@/components/ui";
import {Modal} from "@/components/ui/Modal";
const links = process.env.NEXT_PUBLIC_BAZAAR_MARKETPLACE === 'true'
 ? [{href:"/catalogo",label:"Mercado"},{href:"/hub",label:"Conectar agente"},{href:"/open",label:"Crear espacio"},{href:"/publish",label:"Publicar"},{href:"/history",label:"Mi espacio"}]
 : [{href:"/catalogo",label:"Mercado"},{href:"/hub",label:"Conectar"},{href:"/publish",label:"Publicar"},{href:"/history",label:"Historial"},{href:"/docs",label:"Docs"}];
export function Navbar({prefetch = false}: {prefetch?: boolean} = {}) {
 const {t, language} = useUiLanguage();
 const pathname=usePathname(); const [open,setOpen]=useState(false);
 useEffect(()=>setOpen(false),[pathname]);
 const navigation=links.map(link=><Link key={link.href} href={link.href} prefetch={prefetch} aria-current={pathname===link.href?"page":undefined} onClick={()=>setOpen(false)}>{t(link.label)}</Link>);
 return <><nav className="shell ui-nav" aria-label={t("Navegación principal")}><Link href="/" prefetch={prefetch} className="brand"><span aria-hidden="true">✦</span> Bazaar <sup>x402</sup></Link><div className="ui-nav-links">{navigation}</div><Pill tone="info">Stellar Testnet</Pill><LanguageSwitch/><Button variant="secondary" className="ui-menu-toggle" aria-expanded={open} aria-haspopup="dialog" onClick={()=>setOpen(true)}><UiText text="Menú"/></Button></nav><Modal open={open} onClose={()=>setOpen(false)} title={t("Navegación")}><nav className="ui-menu-links" aria-label={t("Navegación móvil")}>{navigation}</nav><div className="ui-menu-group"><Pill tone="info"><UiText text="Red de pruebas · USDC de Testnet"/></Pill></div></Modal></>;
}
