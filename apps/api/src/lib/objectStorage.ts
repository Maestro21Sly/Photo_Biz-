import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "../env.js";

export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Lazily created S3 client (only when STORAGE_DRIVER=s3).
let s3Client: import("@aws-sdk/client-s3").S3Client | null = null;
async function getS3() {
  if (!s3Client) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    s3Client = new S3Client({
      region: env.s3.region,
      ...(env.s3.endpoint ? { endpoint: env.s3.endpoint, forcePathStyle: true } : {}),
      credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
    });
  }
  return s3Client;
}

// Keys are minted here, never taken from user input, so this is the exact shape
// we expect back. Anything else is rejected rather than passed to fs/S3.
const KEY_PATTERN = /^[0-9a-f]{32}\.[a-z0-9]{2,5}$/;

/** The extension always comes from the *detected* image type, never the upload's filename. */
export function newKey(ext: string): string {
  const safeExt = ext.replace(/^\./, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${crypto.randomBytes(16).toString("hex")}.${safeExt || "bin"}`;
}

/** Store a buffer under `key`, returning a public URL. */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  if (!KEY_PATTERN.test(key)) throw new Error("Refusing to store an unrecognised object key");
  if (env.storageDriver === "s3") {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await getS3();
    await client.send(
      new PutObjectCommand({
        Bucket: env.s3.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
    const base = env.s3.publicUrl.replace(/\/$/, "");
    return `${base}/${key}`;
  }
  // local
  fs.writeFileSync(path.join(UPLOAD_DIR, key), body);
  return `${env.publicBaseUrl}/uploads/${key}`;
}

/**
 * Best-effort delete by the public URL we previously returned. The key is
 * re-validated against KEY_PATTERN rather than trusted: the URL comes back out
 * of the database, and an unvalidated trailing path segment is one bad write
 * away from becoming an arbitrary-file delete under UPLOAD_DIR.
 */
export async function deleteByUrl(url: string): Promise<void> {
  const key = url.split("/").pop();
  if (!key || !KEY_PATTERN.test(key)) return;
  try {
    if (env.storageDriver === "s3") {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await getS3();
      await client.send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    } else {
      fs.rmSync(path.join(UPLOAD_DIR, key), { force: true });
    }
  } catch {
    /* best-effort */
  }
}
