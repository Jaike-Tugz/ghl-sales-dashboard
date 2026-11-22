import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { env, requireEnv } from "./env";

/**
 * AES-256-GCM for GHL OAuth tokens at rest. Format: v1.<iv>.<tag>.<ciphertext>
 * (base64url). CREDENTIALS_ENCRYPTION_KEY must be 32 bytes, base64-encoded:
 *   openssl rand -base64 32
 */
function key(): Buffer {
  const raw = requireEnv(env.credentialsKey(), "CREDENTIALS_ENCRYPTION_KEY");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return buf;
}

export function encryptSecret(plain: string, k: Buffer = key()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, k: Buffer = key()): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised encrypted credential format");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
