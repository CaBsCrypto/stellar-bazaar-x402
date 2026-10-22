import {open} from 'node:fs/promises';
export function lastSealedLine(bytes,{startsAtZero=false}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length>65536)throw Error('SEALED_JOURNAL_TAIL_BOUND');
 const text=bytes.toString('utf8'),lines=text.trimEnd().split('\n');
 if(!startsAtZero&&lines.length<2)throw Error('SEALED_JOURNAL_LAST_RECORD_TOO_LARGE');
 const line=lines.at(-1).trim();if(!line||line.length>32768||!/^[A-Za-z0-9+/]+=*$/.test(line))throw Error('SEALED_JOURNAL_LAST_RECORD_INVALID');
 return line;
}
/** Append-only encrypted history remains untouched; only its final bounded
 * record is read. This limit is local journal I/O, never a runtime quota. */
export async function readBoundedSealedJournalTail(path){
 const f=await open(path,'r');let bytes;
 try{const stat=await f.stat();if(!stat.isFile()||stat.size<1||stat.size>8388608)throw Error('SEALED_JOURNAL_FILE_BOUND');const length=Math.min(65536,stat.size),start=stat.size-length;bytes=Buffer.alloc(length);const r=await f.read(bytes,0,length,start);if(r.bytesRead!==length)throw Error('SEALED_JOURNAL_READ_UNCONFIRMED');return lastSealedLine(bytes,{startsAtZero:start===0});}
 finally{bytes?.fill(0);await f.close();}
}
