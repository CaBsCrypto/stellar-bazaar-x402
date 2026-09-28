/** Local pilot only. A persistent lock is never stolen after a crash. Fail closed. */
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
export interface PaymentJournal {
  binding: string;
  phase: "started" | "response" | "completed";
  card?: import("./types.ts").ServiceCard;
  response?: { status:number; body:string; headers:Record<string,string> };
  outcome?: unknown;
}
export interface PaymentJournalStore {
  exclusive<T>(key:string, fn:(read:()=>Promise<PaymentJournal|undefined>, save:(state:PaymentJournal)=>Promise<void>)=>Promise<T>):Promise<T>;
}
export function assertPaymentJournal(value: unknown): asserts value is PaymentJournal {
  const record = value as PaymentJournal;
  if (!record || typeof record !== "object" || Array.isArray(record) ||
      typeof record.binding !== "string" || !/^[a-f0-9]{64}$/.test(record.binding) ||
      !["started", "response", "completed"].includes(record.phase)) throw Error("PAYMENT_JOURNAL_INVALID");
  if (record.phase === "started" && (record.response !== undefined || record.outcome !== undefined)) throw Error("PAYMENT_JOURNAL_INVALID");
  if (record.phase === "response" && (!record.response || record.outcome !== undefined)) throw Error("PAYMENT_JOURNAL_INVALID");
  if (record.phase === "completed" && (!record.outcome || typeof record.outcome !== "object" || Array.isArray(record.outcome))) throw Error("PAYMENT_JOURNAL_INVALID");
  if (record.response !== undefined) {
    const r = record.response;
    if (!r || !Number.isInteger(r.status) || r.status < 200 || r.status > 599 || typeof r.body !== "string" ||
        !r.headers || typeof r.headers !== "object" || Array.isArray(r.headers) || Object.values(r.headers).some(v => typeof v !== "string")) throw Error("PAYMENT_JOURNAL_INVALID");
  }
}
export function paymentBinding(value:unknown):string {
  function stable(v:unknown):unknown { return Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,stable(x)])) : v; }
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
export class FilePaymentJournal implements PaymentJournalStore {
  private directory:string;
  constructor(directory:string) { this.directory=resolve(directory); }
  async exclusive<T>(key:string, fn:(read:()=>Promise<PaymentJournal|undefined>, save:(state:PaymentJournal)=>Promise<void>)=>Promise<T>):Promise<T> {
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const name=join(this.directory, paymentBinding(key)), lock=name+".lock", file=name+".json";
    let handle;
    try {handle=await open(lock,"wx",0o600);} catch(e) {if((e as NodeJS.ErrnoException).code === "EEXIST") throw Error("PAYMENT_PENDING: operation locked; reconcile, never reset the marker."); throw e;}
    try {
      return await fn(async()=>{try{const record:unknown=JSON.parse(await readFile(file,"utf8"));assertPaymentJournal(record);return record;}catch(e){if((e as NodeJS.ErrnoException).code === "ENOENT")return undefined;throw e;}},async state=>{
        assertPaymentJournal(state);
        const temporary=file+"."+randomUUID();
        await writeFile(temporary,JSON.stringify(state),{mode:0o600,flag:"wx"});
        const tempHandle=await open(temporary,"r+");try{await tempHandle.sync();}finally{await tempHandle.close();}
        await rename(temporary,file);
      });
    } finally {await handle.close();await unlink(lock);}
  }
}
