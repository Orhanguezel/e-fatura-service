import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class CryptoKeyError extends Error {
  constructor() {
    super("EFATURA_ENC_KEY must resolve to exactly 32 bytes");
  }
}

export function parseEncryptionKey(rawKey: string): Buffer {
  const trimmed = rawKey.trim();
  const hexKey = /^[a-f0-9]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : null;
  const base64Key = /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)
    ? Buffer.from(trimmed, "base64")
    : null;
  const utf8Key = Buffer.from(trimmed, "utf8");
  const key = [hexKey, base64Key, utf8Key].find(
    (candidate) => candidate?.byteLength === 32
  );

  if (!key) {
    throw new CryptoKeyError();
  }

  return key;
}

export function encryptSecret(plaintext: string, rawKey: string): string {
  const key = parseEncryptionKey(rawKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return [iv, tag, ciphertext]
    .map((part) => part.toString("base64"))
    .join(".");
}

export function decryptSecret(payload: string, rawKey: string): string {
  const [ivPart, tagPart, ciphertextPart] = payload.split(".");

  if (!ivPart || !tagPart || !ciphertextPart) {
    throw new Error("Encrypted payload must be iv.tag.ciphertext");
  }

  const iv = Buffer.from(ivPart, "base64");
  const tag = Buffer.from(tagPart, "base64");
  const ciphertext = Buffer.from(ciphertextPart, "base64");

  if (iv.byteLength !== IV_LENGTH || tag.byteLength !== AUTH_TAG_LENGTH) {
    throw new Error("Encrypted payload has invalid iv or tag length");
  }

  const decipher = createDecipheriv(ALGORITHM, parseEncryptionKey(rawKey), iv, {
    authTagLength: AUTH_TAG_LENGTH
  });
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]).toString("utf8");
}

export function safeEqualSecrets(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
