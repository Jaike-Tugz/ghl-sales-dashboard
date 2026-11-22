import { createHash, createVerify } from "node:crypto";

/**
 * Public key GHL documents for verifying the `x-wh-signature` header
 * (RSA-SHA256 over the raw request body, base64 signature). Source:
 * highlevel-api-docs/docs/oauth/WebhookAuthentication.md. GHL announces key
 * rotations by email — override with GHL_WEBHOOK_PUBLIC_KEY when they do.
 */
export const GHL_DOCUMENTED_WEBHOOK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

export function verifyGhlSignature(rawBody: string, signature: string | null, publicKey: string): boolean {
  if (!signature) return false;
  try {
    const verifier = createVerify("SHA256");
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(publicKey.replace(/\\n/g, "\n"), signature, "base64");
  } catch {
    return false;
  }
}

export interface WebhookEnvelope {
  type: string;
  locationId: string | null;
  webhookId: string | null;
  timestamp: string | null;
  payload: Record<string, unknown>;
}

export function parseEnvelope(rawBody: string): WebhookEnvelope {
  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Webhook body is not a JSON object");
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    type: str(payload.type) ?? "Unknown",
    locationId: str(payload.locationId),
    webhookId: str(payload.webhookId),
    timestamp: str(payload.timestamp),
    payload,
  };
}

/** webhookId when GHL provides it (documented for replay protection), else a body hash. */
export function dedupeKey(env: WebhookEnvelope, rawBody: string): string {
  if (env.webhookId) return `wh:${env.webhookId}`;
  return `sha256:${createHash("sha256").update(rawBody).digest("hex")}`;
}

/** Reject replays older than the window (only when GHL includes a timestamp). */
export function isFresh(env: WebhookEnvelope, maxAgeSeconds: number, now = Date.now()): boolean {
  if (!env.timestamp) return true;
  const t = Date.parse(env.timestamp);
  if (!Number.isFinite(t)) return true;
  return Math.abs(now - t) <= maxAgeSeconds * 1000;
}

/** Event types this app acts on. Everything else is stored and marked ignored. */
export const HANDLED_EVENTS = new Set([
  "ContactCreate",
  "ContactUpdate",
  "ContactDelete",
  "OpportunityCreate",
  "OpportunityUpdate",
  "OpportunityDelete",
  "OpportunityStageUpdate",
  "OpportunityStatusUpdate",
  "OpportunityMonetaryValueUpdate",
  "OpportunityAssignedToUpdate",
  "AppointmentCreate",
  "AppointmentUpdate",
  "AppointmentDelete",
  "InboundMessage",
  "OutboundMessage",
  "AppInstall",
  "AppUninstall",
  "INSTALL",
  "UNINSTALL",
]);
