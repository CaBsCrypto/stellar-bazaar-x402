"use client";
import {useState} from "react";
import {AgentHub} from "./AgentHub";
import {Button} from "./ui";
import {Modal} from "./ui/Modal";
export function LandingConnect() {
  const [open,setOpen]=useState(false);
  return <><Button onClick={()=>setOpen(true)} aria-haspopup="dialog">Conectar mi agente</Button>
    <Modal open={open} onClose={()=>setOpen(false)} title="Conectar tu agente" wide>
      {open && <AgentHub />}
    </Modal></>;
}
