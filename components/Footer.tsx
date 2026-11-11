"use client";

import {UiText, useUiLanguage} from "@/components/UiLanguage";
import Link from "next/link";
export function Footer({prefetch = false}: {prefetch?: boolean} = {}) {
 const {t, language} = useUiLanguage(); const market = process.env.NEXT_PUBLIC_BAZAAR_MARKETPLACE === 'true'; return <footer className="ui-footer"><div className="shell ui-footer-inner"><div><Link className="brand" href="/" prefetch={prefetch}><span aria-hidden="true">✦</span> Bazaar <sup>x402</sup></Link><p className="ui-muted"><UiText text="Servicios para agentes. Pagos en Stellar Testnet."/></p><p className="ui-footer-credit">Powered by <strong>Browns Studio</strong></p></div><nav aria-label={t("Enlaces del pie")}><Link href='/docs' prefetch={prefetch}><UiText text="Documentación"/></Link><Link href="/publish" prefetch={prefetch}><UiText text="Publicar servicio"/></Link>{!market && <Link href="/lab" prefetch={prefetch}>Lab · Demos y experimentos</Link>}</nav></div></footer>; }
