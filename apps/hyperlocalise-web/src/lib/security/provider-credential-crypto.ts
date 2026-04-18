import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

const encryptionAlgorithm = "aes-256-gcm";
const currentKeyVersion = 1;

function parseMasterKey(input: string) {
  const trimmed = input.trim();

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  const base64Buffer = Buffer.from(trimmed, "base64");
  if (base64Buffer.length === 32 && base64Buffer.toString("base64") === trimmed) {
    return base64Buffer;
  }

  if (trimmed.length === 32) {
    return Buffer.from(trimmed, "utf8");
  }

  throw new Error("invalid_provider_credentials_master_key");
}

function getMasterKey() {
  const key = parseMasterKey(env.PROVIDER_CREDENTIALS_MASTER_KEY);
  if (key.length !== 32) {
    throw new Error("invalid_provider_credentials_master_key");
  }

  return key;
}

export function encryptProviderCredential(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(encryptionAlgorithm, getMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    algorithm: encryptionAlgorithm,
    keyVersion: currentKeyVersion,
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptProviderCredential(input: {
  algorithm: string;
  ciphertext: string;
  iv: string;
  authTag: string;
}) {
  if (input.algorithm !== encryptionAlgorithm) {
    throw new Error("unsupported_provider_credential_algorithm");
  }

  const decipher = createDecipheriv(
    input.algorithm,
    getMasterKey(),
    Buffer.from(input.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskProviderCredentialSuffix(secret: string) {
  return secret.slice(-4).padStart(4, "•");
}
