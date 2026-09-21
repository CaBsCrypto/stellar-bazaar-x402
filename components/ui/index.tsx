import Link from "next/link";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
export function PageShell({className = "", ...props}: HTMLAttributes<HTMLDivElement>) { return <div className={`shell ui-page ${className}`} {...props} />; }
export function Card({className = "", ...props}: HTMLAttributes<HTMLElement>) { return <section className={`ui-card ${className}`} {...props} />; }
export function Button({variant = "primary", busy = false, className = "", children, disabled, ...props}: ComponentProps<"button"> & {variant?: "primary" | "secondary" | "quiet"; busy?: boolean}) { return <button type="button" className={`ui-button ui-button--${variant} ${className}`} aria-busy={busy || undefined} disabled={disabled || busy} {...props}>{busy ? "Cargando…" : children}</button>; }
export function ButtonLink({variant = "primary", className = "", ...props}: ComponentProps<typeof Link> & {variant?: "primary" | "secondary" | "quiet"}) { return <Link className={`ui-button ui-button--${variant} ${className}`} {...props} />; }
export function Pill({tone = "neutral", children}: {tone?: "neutral" | "success" | "warning" | "info"; children: ReactNode}) { return <span className={`ui-pill ui-pill--${tone}`}>{children}</span>; }
export function SectionHeading({eyebrow, title, children}: {eyebrow?: string; title: string; children?: ReactNode}) { return <header className="ui-section-heading"><div>{eyebrow && <span className="kicker">{eyebrow}</span>}<h2>{title}</h2></div>{children && <div className="ui-muted">{children}</div>}</header>; }
