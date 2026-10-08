import {S3Client,HeadBucketCommand} from '@aws-sdk/client-s3';
import {demoConfiguration} from './demo-configuration.ts';

export type StorageProbe={configured:boolean;reachable:boolean;code:string};
let injected:(()=>Promise<StorageProbe>)|undefined;
/** Local dependency injection only; no handler or environment flag can set it. */
export function setMarketStorageProbeForTests(probe:(()=>Promise<StorageProbe>)|undefined){injected=probe;}
/** Operator-only callers receive fixed status codes, never SDK diagnostics or credentials. */
export async function probeMarketStorage():Promise<StorageProbe>{
 if(injected)return injected();
 if(!demoConfiguration().r2Configured)return {configured:false,reachable:false,code:'PRIVATE_FILES_NOT_CONFIGURED'};
 const client=new S3Client({region:process.env.BAZAAR_S3_REGION,endpoint:process.env.BAZAAR_S3_ENDPOINT,forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:process.env.BAZAAR_S3_ACCESS_KEY_ID?.trim()||process.env.BAZAAR_S3_KEY_ID!.trim(),secretAccessKey:process.env.BAZAAR_S3_SECRET_ACCESS_KEY?.trim()||process.env.BAZAAR_S3_APP_KEY!.trim()},requestChecksumCalculation:'WHEN_REQUIRED'});
 try{await client.send(new HeadBucketCommand({Bucket:process.env.BAZAAR_S3_BUCKET}),{abortSignal:AbortSignal.timeout(10000)});return {configured:true,reachable:true,code:'STORAGE_REACHABLE'};}
 catch(error){const failure=error as {name?:string;$metadata?:{httpStatusCode?:number}},status=failure.$metadata?.httpStatusCode;return {configured:true,reachable:false,code:status===403?'STORAGE_ACCESS_DENIED':status===404?'STORAGE_BUCKET_NOT_FOUND':failure.name==='AbortError'||failure.name==='TimeoutError'?'STORAGE_TIMEOUT':'STORAGE_UNREACHABLE'};}
 finally{client.destroy();}
}
