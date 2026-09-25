"use client";
import {useEffect, useRef, type ReactNode} from "react";
import {Button} from "./index";
/** Native modal supplies focus containment, inert background and Escape handling. */
export function Modal({open, onClose, title, children, wide = false, className = ""}: {open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; className?: string}) {
 const ref = useRef<HTMLDialogElement>(null);
 useEffect(() => {
  const dialog = ref.current;
  if (!open || !dialog) return;
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overflow = document.body.style.overflow;
  dialog.showModal(); document.body.style.overflow = "hidden";
  return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus(); };
 }, [open]);
 return <dialog ref={ref} className={`ui-modal ${wide ? "ui-modal--wide" : ""} ${className}`} aria-label={title} onKeyDown={event => {
  if(event.key !== "Tab") return;
  const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), summary, a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0 && el.checkVisibility());
  const first = nodes[0], last = nodes[nodes.length - 1];
  if(event.shiftKey && document.activeElement === first){event.preventDefault(); last?.focus();}
  else if(!event.shiftKey && document.activeElement === last){event.preventDefault(); first?.focus();}
 }} onCancel={event => {event.preventDefault(); onClose();}} onClick={event => {if(event.target === ref.current) onClose();}}><div className="ui-modal-content"><header className="ui-section-heading"><h2>{title}</h2><Button variant="quiet" onClick={onClose} aria-label={`Cerrar ${title.toLowerCase()}`}>Cerrar ×</Button></header>{children}</div></dialog>;
}
