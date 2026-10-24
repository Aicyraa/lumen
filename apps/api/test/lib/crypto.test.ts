import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskKey } from "../../src/shared/lib/crypto.js";

const key = "0123456789abcdef".repeat(4);

describe("encryptSecret / decryptSecret (AES-256-GCM)", () => {
  it("round trips and never contains the plaintext", () => {
    const blob = encryptSecret("sk-live-1234567890", key, "tenant-a");
    expect(blob).not.toContain("sk-live");
    expect(decryptSecret(blob, key, "tenant-a")).toBe("sk-live-1234567890");
  });
  it("uses a fresh random IV: the same input encrypts differently each time", () => {
    expect(encryptSecret("same", key, "t")).not.toBe(encryptSecret("same", key, "t"));
  });
  it("fails when the ciphertext, tag or IV is tampered with", () => {
    const [iv, tag, ct] = encryptSecret("secret-value", key, "t").split(".");
    const flip = (b64: string) => { const b = Buffer.from(b64, "base64url"); b[0] ^= 1; return b.toString("base64url"); };
    for (const parts of [[iv, tag, flip(ct)], [iv, flip(tag), ct], [flip(iv), tag, ct]]) {
      expect(() => decryptSecret(parts.join("."), key, "t")).toThrow();
    }
  });
  it("fails with the wrong key, the wrong tenant binding, or a malformed blob", () => {
    const blob = encryptSecret("secret-value", key, "tenant-a");
    expect(() => decryptSecret(blob, "f".repeat(64), "tenant-a")).toThrow();
    expect(() => decryptSecret(blob, key, "tenant-b")).toThrow();
    expect(() => decryptSecret("garbage", key, "tenant-a")).toThrow();
  });
  it("refuses a key that is not 32 bytes of hex", () => {
    expect(() => encryptSecret("x", "abcd", "t")).toThrow();
  });
});

describe("maskKey", () => {
  it.each([
    ["sk-abcdefgh1234a1b2", "sk-...a1b2"],
    ["sk-ant-api03-zzzzzzzzzzzza1b2", "sk-...a1b2"],
    ["AIzaSyABCDEFGHIJKLMNa1b2", "...a1b2"],
  ])("%s -> %s and never reveals more than the last four characters", (input, hint) => {
    expect(maskKey(input)).toBe(hint);
  });
});
