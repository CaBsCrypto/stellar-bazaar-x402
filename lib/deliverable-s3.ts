import { createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DeliverableError } from "./deliverable-store.ts";
import type { DeliveryFile } from "./deliverable.ts";
export interface PrivateObjectStorage {
  upload(
    owner: string,
    versionId: string,
    file: DeliveryFile,
    deadline?: number,
  ): Promise<{
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
  }>;
  verify(owner: string, versionId: string, file: DeliveryFile): Promise<void>;
  access(
    owner: string,
    versionId: string,
    file: DeliveryFile,
    download: boolean,
    deadline?: number,
  ): Promise<{ url: string; expiresAt: string }>;
  remove(owner:string,versionId:string,file:DeliveryFile):Promise<void>;
  cleanupKey?(owner:string,versionId:string,fileId:string):string;
  removeKey?(key:string):Promise<void>;
}
const previewTypes = new Set([
  "video/mp4",
  "video/webm",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "text/vtt",
]);
export function createPrivateS3(
  client: S3Client,
  bucket: string,
  options: {keyPrefix?:string} = {},
): PrivateObjectStorage {
  const prefix=options.keyPrefix??'deliveries/v1';
  if(!/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,200}$/.test(prefix)||prefix.endsWith('/')||prefix.includes('//'))throw new DeliverableError('INVALID_STORAGE_PREFIX');
  const key = (owner: string, version: string, file: string) =>
    prefix+"/" +
    [owner, version, file]
      .map((v) => createHash("sha256").update(v).digest("hex"))
      .join("/");
  const checksum = (file: DeliveryFile) =>
    Buffer.from(file.sha256, "hex").toString("base64");
  // Signing can await credentials or an occupied event loop. Use one timestamp
  // for the signature and reported lifetime so that delay cannot renew access.
  const grant=(maximum:number,deadline?:number)=>{
    const signingDate=new Date(Date.now()),seconds=deadline===undefined?maximum:Math.min(maximum,Math.floor((deadline-signingDate.getTime())/1000));
    if(!Number.isFinite(seconds)||seconds<1)throw new DeliverableError('DELIVERY_EXPIRED',410);
    return {signingDate,expiresIn:seconds,expiresAt:new Date(signingDate.getTime()+seconds*1000).toISOString()};
  };
  const current=(expiresAt:string)=>{if(Date.parse(expiresAt)<=Date.now())throw new DeliverableError('DELIVERY_EXPIRED',410);};
  return {
    async upload(owner, version, file, deadline) {
      const {signingDate,expiresIn,expiresAt}=grant(600,deadline);
      const headers = {
        "content-type": file.mediaType,
        "content-length": String(file.size),
        "x-amz-checksum-sha256": checksum(file),
        "if-none-match": "*",
      };
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key(owner, version, file.id),
        ContentType: file.mediaType,
        ContentLength: file.size,
        ChecksumSHA256: checksum(file),
        IfNoneMatch: "*",
      });
      const url = await getSignedUrl(client, command, {
        signingDate,
        expiresIn,
        unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
        signableHeaders:new Set(['content-length','content-type']),
      });
      current(expiresAt);
      return {
        url,
        headers,
        expiresAt,
      };
    },
    async verify(owner, version, file) {
      let head;
      try{head = await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key(owner, version, file.id),
          ChecksumMode: "ENABLED",
        }),{abortSignal:AbortSignal.timeout(10000)},
      );}catch(error){const failure=error as {name?:string;$metadata?:{httpStatusCode?:number}};if(failure.$metadata?.httpStatusCode===404||failure.name==='NotFound'||failure.name==='NoSuchKey')throw new DeliverableError('FILE_NOT_UPLOADED',409);throw error;}
      if (
        head.ContentLength !== file.size ||
        head.ChecksumSHA256 !== checksum(file) ||
        head.ContentType !== file.mediaType
      )
        throw new DeliverableError("FILE_INTEGRITY_MISMATCH", 409);
    },
    async access(owner, version, file, download, deadline) {
      const {signingDate,expiresIn,expiresAt}=grant(300,deadline);
      const disposition =
        download || !previewTypes.has(file.mediaType) ? "attachment" : "inline";
      const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key(owner, version, file.id),
          ResponseContentType:
            disposition === "inline"
              ? file.mediaType
              : "application/octet-stream",
          ResponseContentDisposition:
            disposition + '; filename="' + filename + '"',
        }),
        { signingDate,expiresIn },
      );
      current(expiresAt);
      return { url, expiresAt };
    },
    async remove(owner,version,file){await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key(owner,version,file.id)}),{abortSignal:AbortSignal.timeout(10000)});},
    cleanupKey(owner,version,fileId){return key(owner,version,fileId);},
    async removeKey(objectKey){
      const tail=objectKey.startsWith(prefix+'/')?objectKey.slice(prefix.length+1):'';
      if(!/^[a-f0-9]{64}\/[a-f0-9]{64}\/[a-f0-9]{64}$/.test(tail))throw new DeliverableError('INVALID_CLEANUP_KEY',400);
      await client.send(new DeleteObjectCommand({Bucket:bucket,Key:objectKey}),{abortSignal:AbortSignal.timeout(10000)});
    },
  };
}
export function configuredPrivateS3(options:{keyPrefix?:string}={}): PrivateObjectStorage {
  const bucket = process.env.BAZAAR_S3_BUCKET,
    region = process.env.BAZAAR_S3_REGION,
    endpoint = process.env.BAZAAR_S3_ENDPOINT;
  const accessKeyId = process.env.BAZAAR_S3_ACCESS_KEY_ID?.trim() || process.env.BAZAAR_S3_KEY_ID?.trim(),
    secretAccessKey = process.env.BAZAAR_S3_SECRET_ACCESS_KEY?.trim() || process.env.BAZAAR_S3_APP_KEY?.trim();
  if (!bucket || !region || !accessKeyId || !secretAccessKey)
    throw new DeliverableError("PRIVATE_FILES_NOT_CONFIGURED");
  if (endpoint) {
    const url = new URL(endpoint);
    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" &&
        !(
          process.env.NODE_ENV !== "production" &&
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        ))
    )
      throw new DeliverableError("INVALID_STORAGE_ENDPOINT");
  }
  return createPrivateS3(
    new S3Client({
      region,
      endpoint,
      forcePathStyle: !!endpoint,
      maxAttempts:1,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
    }),
    bucket,
    options,
  );
}
