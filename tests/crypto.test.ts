import { describe, expect, it } from "vitest";

import {
  decryptSecret,
  encryptSecret,
  parseEncryptionKey
} from "../src/lib/crypto";

describe("credential encryption", () => {
  it("round-trips secrets with AES-256-GCM", () => {
    const key = Buffer.from("12345678901234567890123456789012").toString(
      "base64"
    );
    const encrypted = encryptSecret("nilvera-secret", key);

    expect(encrypted.split(".")).toHaveLength(3);
    expect(decryptSecret(encrypted, key)).toBe("nilvera-secret");
  });

  it("rejects invalid key lengths", () => {
    expect(() => parseEncryptionKey("short")).toThrow(
      "EFATURA_ENC_KEY must resolve to exactly 32 bytes"
    );
  });
});
