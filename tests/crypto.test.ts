import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

describe("credential encryption", () => {
  const key = randomBytes(32);
  it("round-trips", () => expect(decryptSecret(encryptSecret("secret-token", key), key)).toBe("secret-token"));
  it("uses a fresh IV each time", () => expect(encryptSecret("a", key)).not.toBe(encryptSecret("a", key)));
  it("rejects tampering", () => {
    const enc = encryptSecret("secret", key).split(".");
    enc[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(enc.join("."), key)).toThrow();
  });
  it("rejects the wrong key", () => expect(() => decryptSecret(encryptSecret("s", key), randomBytes(32))).toThrow());
});
