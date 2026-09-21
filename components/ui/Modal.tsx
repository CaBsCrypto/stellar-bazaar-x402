"use client";
import {useEffect, useRef, type ReactNode} from "react";
import {Button} from "./index";
/** Native modal supplies focus containment, inert background and Escape handling. */
export function Modal({open, onClose, title, children}: {open: boolean; onClose: () => void; title: string; children: ReactNode}) {
 const ref = useRef<HTMLDialogElement>(null);
 useEffect(() => {
  const dialog = ref.current;
  if (!open || !dialog) return;
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overflow = document.body.style.overflow;
  dialog.showModal(); document.body.style.overflow = "hidden";
  return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus(); };
 }, [open]);
 return <dialog ref={ref} className="ui-modal" aria-label={title} onCancel={event => {event.preventDefault(); onClose();}} onClick={event => {if(event.target === ref.current) onClose();}}><div className="ui-modal-content"><header className="ui-section-heading"><h2>{title}</h2><Button variant="quiet" onClick={onClose} aria-label="Cerrar menú">Cerrar ×</Button></header>{children}</div></dialog>;
}
