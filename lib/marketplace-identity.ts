import {createHash} from 'node:crypto';
export const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
export function canonical(v:unknown):string {if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical((v as Record<string,unknown>)[k])).join(',')+'}';return JSON.stringify(v);}
export const orderMemo=(owner:string,id:string,cardHash:string,input:unknown)=>sha(`bazaar-order:${owner}:${id}:${cardHash}:${sha(canonical(input))}`);
