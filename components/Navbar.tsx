"use client";
import Link from "next/link";
import {useEffect, useState} from "react";
import {usePathname} from "next/navigation";
import {Button, Pill} from "@/components/ui";
import {Modal} from "@/components/ui/Modal";
const links = [{href:"/catalogo",label:"Mercado"},{href:"/hub",label:"Conectar"},{href:"/publish",label:"Publicar"},{href:"/history",label:"Historial"},{href:"/docs",label:"Docs"}];
export function Navbar() {
 const pathname=usePathname(); const [open,setOpen]=useState(false);
 useEffect(()=>setOpen(false),[pathname]);
 const navigation=links.map(link=><Link key={link.href} href={link.href} aria-current={pathname===link.href?"page":undefined} onClick={()=>setOpen(false)}>{link.label}</Link>);
 return <><nav className="shell ui-nav" aria-label="Navegación principal"><Link href="/" className="brand"><span aria-hidden="true">✦</span> Bazaar <sup>x402</sup></Link><div className="ui-nav-links">{navigation}</div><Pill tone="info">Stellar Testnet</Pill><Button variant="secondary" className="ui-menu-toggle" aria-expanded={open} aria-haspopup="dialog" onClick={()=>setOpen(true)}>Menú</Button></nav><Modal open={open} onClose={()=>setOpen(false)} title="Navegación"><nav className="ui-menu-links" aria-label="Navegación móvil">{navigation}</nav><div className="ui-menu-group"><Pill tone="info">Red de pruebas · USDC de Testnet</Pill></div></Modal></>;
}
