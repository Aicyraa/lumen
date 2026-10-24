import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for tenants' provider keys (rule 11). Blob format: iv.tag.ciphertext (base64url).
// `aad` (the tenant id) is authenticated, so a blob copied to another tenant's row fails to decrypt.
const keyBytes = (hex: string) => {
  const key = Buffer.from(hex, "hex");
  if (!/^[0-9a-fA-F]{64}$/.test(hex) || key.length !== 32)
    throw new Error("encryption key must be 32 bytes (64 hex characters)");
  return key;
};

export function encryptSecret(plain: string, hexKey: string, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(hexKey), iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(blob: string, hexKey: string, aad: string): string {
  const parts = blob.split(".");
  if (parts.length !== 3) throw new Error("malformed encrypted value");
  const [iv, tag, ct] = parts.map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(hexKey), iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// 'sk-...a1b2': a leading letters-and-dash prefix (if any) plus the last four characters.
export const maskKey = (key: string): string =>
  `${key.match(/^[A-Za-z]+-/)?.[0] ?? ""}...${key.slice(-4)}`;
