"use client";
import {UiText, useUiLanguage} from "@/components/UiLanguage";

import {useState} from "react";
import {AgentHub} from "./AgentHub";
import {Button} from "./ui";
import {Modal} from "./ui/Modal";
export function LandingConnect() {
 const {t, language} = useUiLanguage();
  const [open,setOpen]=useState(false);
  return <><Button onClick={()=>setOpen(true)} aria-haspopup="dialog"><UiText text="Conectar mi agente"/></Button>
    <Modal open={open} onClose={()=>setOpen(false)} title={t("Conectar tu agente")} wide className="connection-modal">
      {open && <AgentHub compact />}
    </Modal></>;
}
