import { createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DeliverableError } from "./deliverable-store.ts";
import type { DeliveryFile } from "./deliverable.ts";
export interface PrivateObjectStorage {
  upload(
    owner: string,
    versionId: string,
    file: DeliveryFile,
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
  ): Promise<{ url: string; expiresAt: string }>;
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
): PrivateObjectStorage {
  const key = (owner: string, version: string, file: string) =>
    "deliveries/v1/" +
    [owner, version, file]
      .map((v) => createHash("sha256").update(v).digest("hex"))
      .join("/");
  const checksum = (file: DeliveryFile) =>
    Buffer.from(file.sha256, "hex").toString("base64");
  return {
    async upload(owner, version, file) {
      const headers = {
        "content-type": file.mediaType,
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
        expiresIn: 600,
        unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
      });
      return {
        url,
        headers,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
    },
    async verify(owner, version, file) {
      const head = await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key(owner, version, file.id),
          ChecksumMode: "ENABLED",
        }),
      );
      if (
        head.ContentLength !== file.size ||
        head.ChecksumSHA256 !== checksum(file) ||
        head.ContentType !== file.mediaType
      )
        throw new DeliverableError("FILE_INTEGRITY_MISMATCH", 409);
    },
    async access(owner, version, file, download) {
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
        { expiresIn: 300 },
      );
      return { url, expiresAt: new Date(Date.now() + 300000).toISOString() };
    },
  };
}
export function configuredPrivateS3(): PrivateObjectStorage {
  const bucket = process.env.BAZAAR_S3_BUCKET,
    region = process.env.BAZAAR_S3_REGION,
    endpoint = process.env.BAZAAR_S3_ENDPOINT;
  const accessKeyId = process.env.BAZAAR_S3_ACCESS_KEY_ID,
    secretAccessKey = process.env.BAZAAR_S3_SECRET_ACCESS_KEY;
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
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
    }),
    bucket,
  );
}
