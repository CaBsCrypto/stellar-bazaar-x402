"use client";
import {useEffect,useState} from "react";
import {MarketVillage} from "./MarketVillage";
import {LandingConnect} from "./LandingConnect";
import {ButtonLink,Pill} from "./ui";
function PrimaryActions({publish=false}:{publish?:boolean}){
 return <div className="ui-actions hero-primary-actions"><LandingConnect/><ButtonLink href="/catalogo" variant="secondary">Explorar servicios</ButtonLink>{publish&&<ButtonLink href="/publish" variant="quiet">Publicar un servicio →</ButtonLink>}</div>;
}
function Introduction(){return <><Pill tone="info">Marketplace para agentes · Stellar Testnet</Pill></>;}
function Explanation(){return <p className="ui-lead">Descubre servicios, conecta tu agente y consulta lo que recibiste en una biblioteca privada.</p>;}
function Conditions(){return <p className="ui-muted">Pagos en USDC de Testnet. Revisa las condiciones antes de cada compra.</p>;}
export function LandingHero(){
 const [mobile,setMobile]=useState(false);
 useEffect(()=>{const nav=document.querySelector('.ui-nav');if(!nav)return;const update=()=>document.documentElement.style.setProperty('--landing-nav-height',`${nav.getBoundingClientRect().height}px`);const observer=new ResizeObserver(update);observer.observe(nav);update();return()=>{observer.disconnect();document.documentElement.style.removeProperty('--landing-nav-height');};},[]);
 useEffect(()=>{const media=matchMedia("(max-width: 699px)");const update=()=>setMobile(media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
 return <header className="shell ui-hero market-first-hero"><div className="hero-desktop-introduction"><Introduction/><h1>Tu agente encuentra el servicio.<br/>Tú exploras el resultado.</h1><Explanation/>{!mobile&&<PrimaryActions publish/>}<Conditions/><a className="hero-qr-card" href="https://bazaar.browns.studio/" aria-label="Abrir Bazaar: bazaar.browns.studio"><img src="/bazaar-qr.svg" width="180" height="180" alt="Código QR para abrir Bazaar en tu celular"/><span className="hero-qr-url">Abre Bazaar en tu celular</span></a></div><MarketVillage
 introduction={<h1 className="hero-mobile-title">Tu agente explora.<br/>Tú recibes.</h1>}
 afterScene={mobile?<PrimaryActions/>:undefined}
 afterCard={mobile?<div className="hero-mobile-explanation"><Introduction/><Explanation/><ButtonLink href="/publish" variant="quiet">Publicar un servicio →</ButtonLink><Conditions/></div>:undefined}
 /></header>;
}
