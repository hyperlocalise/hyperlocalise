import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/lib/env";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

const encryptionAlgorithm = "aes-256-gcm";
const currentKeyVersion = 1;

export type EncryptedProviderCredential = {
  algorithm: string;
  keyVersion: number;
  ciphertext: string;
  iv: string;
  authTag: string;
};

export type ProviderCredentialCryptoError =
  | { code: "invalid_provider_credentials_master_key" }
  | { code: "unsupported_provider_credential_key_version" }
  | { code: "unsupported_provider_credential_algorithm" }
  | { code: "provider_credential_decryption_failed" };

export function formatProviderCredentialCryptoError(error: ProviderCredentialCryptoError): string {
  switch (error.code) {
    case "invalid_provider_credentials_master_key":
      return "invalid_provider_credentials_master_key";
    case "unsupported_provider_credential_key_version":
      return "unsupported_provider_credential_key_version";
    case "unsupported_provider_credential_algorithm":
      return "unsupported_provider_credential_algorithm";
    case "provider_credential_decryption_failed":
      return "provider_credential_decryption_failed";
    default:
      return assertNever(error);
  }
}

function parseMasterKey(input: string): Result<Buffer, ProviderCredentialCryptoError> {
  const trimmed = input.trim();

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return ok(Buffer.from(trimmed, "hex"));
  }

  const base64Buffer = Buffer.from(trimmed, "base64");
  if (base64Buffer.length === 32 && base64Buffer.toString("base64") === trimmed) {
    return ok(base64Buffer);
  }

  return err({ code: "invalid_provider_credentials_master_key" });
}

function getMasterKey(
  keyVersion = currentKeyVersion,
): Result<Buffer, ProviderCredentialCryptoError> {
  if (keyVersion !== currentKeyVersion) {
    return err({ code: "unsupported_provider_credential_key_version" });
  }

  const keyResult = parseMasterKey(env.PROVIDER_CREDENTIALS_MASTER_KEY);
  if (isErr(keyResult)) {
    return keyResult;
  }

  if (keyResult.value.length !== 32) {
    return err({ code: "invalid_provider_credentials_master_key" });
  }

  return ok(keyResult.value);
}

export function encryptProviderCredential(
  plaintext: string,
): Result<EncryptedProviderCredential, ProviderCredentialCryptoError> {
  const keyResult = getMasterKey();
  if (isErr(keyResult)) {
    return keyResult;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(encryptionAlgorithm, keyResult.value, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return ok({
    algorithm: encryptionAlgorithm,
    keyVersion: currentKeyVersion,
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  });
}

export function decryptProviderCredential(input: {
  algorithm: string;
  keyVersion: number;
  ciphertext: string;
  iv: string;
  authTag: string;
}): Result<string, ProviderCredentialCryptoError> {
  if (input.algorithm !== encryptionAlgorithm) {
    return err({ code: "unsupported_provider_credential_algorithm" });
  }

  const keyResult = getMasterKey(input.keyVersion);
  if (isErr(keyResult)) {
    return keyResult;
  }

  try {
    const decipher = createDecipheriv(
      input.algorithm,
      keyResult.value,
      Buffer.from(input.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(input.authTag, "base64"));

    return ok(
      Buffer.concat([
        decipher.update(Buffer.from(input.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    return err({ code: "provider_credential_decryption_failed" });
  }
}

export function maskProviderCredentialSuffix(secret: string) {
  return secret.slice(-4).padStart(8, "•");
}

export function unwrapProviderCredentialCrypto<T>(
  result: Result<T, ProviderCredentialCryptoError>,
): T {
  if (isErr(result)) {
    throw new Error(formatProviderCredentialCryptoError(result.error));
  }
  return result.value;
}
