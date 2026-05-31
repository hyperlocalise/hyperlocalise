import "dotenv/config";

import { describe, expect, it } from "vite-plus/test";
import { isErr } from "@/lib/primitives/result/results";

import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
} from "./provider-credential-crypto";

describe("provider-credential-crypto", () => {
  describe("maskProviderCredentialSuffix", () => {
    it("masks the prefix of a secret and only reveals the last 4 characters", () => {
      expect(maskProviderCredentialSuffix("sk-1234567890abcdef")).toBe("••••cdef");
    });

    it("handles short secrets by padding to 8 characters", () => {
      expect(maskProviderCredentialSuffix("abcd")).toBe("••••abcd");
      expect(maskProviderCredentialSuffix("123")).toBe("•••••123");
    });

    it("masks even long secrets to 8 characters total length", () => {
      const longSecret = "a".repeat(100) + "bcde";
      expect(maskProviderCredentialSuffix(longSecret)).toBe("••••bcde");
    });
  });

  describe("encryption/decryption round-trip", () => {
    it("successfully decrypts an encrypted credential", () => {
      const plaintext = "sk-proj-test-secret-key-12345";
      const encryptedResult = encryptProviderCredential(plaintext);
      expect(encryptedResult.ok).toBe(true);
      if (isErr(encryptedResult)) {
        throw new Error("expected encryption to succeed");
      }

      const encrypted = encryptedResult.value;
      expect(encrypted.ciphertext).not.toBe(plaintext);
      expect(encrypted.algorithm).toBe("aes-256-gcm");

      const decryptedResult = decryptProviderCredential(encrypted);
      expect(decryptedResult.ok).toBe(true);
      if (isErr(decryptedResult)) {
        throw new Error("expected decryption to succeed");
      }
      expect(decryptedResult.value).toBe(plaintext);
    });

    it("produces different ciphertexts for the same plaintext (random IV)", () => {
      const plaintext = "sk-proj-test-secret-key-12345";
      const encrypted1Result = encryptProviderCredential(plaintext);
      const encrypted2Result = encryptProviderCredential(plaintext);
      if (isErr(encrypted1Result) || isErr(encrypted2Result)) {
        throw new Error("expected encryption to succeed");
      }

      expect(encrypted1Result.value.ciphertext).not.toBe(encrypted2Result.value.ciphertext);
      expect(encrypted1Result.value.iv).not.toBe(encrypted2Result.value.iv);

      const decrypted1 = decryptProviderCredential(encrypted1Result.value);
      const decrypted2 = decryptProviderCredential(encrypted2Result.value);
      if (isErr(decrypted1) || isErr(decrypted2)) {
        throw new Error("expected decryption to succeed");
      }
      expect(decrypted1.value).toBe(plaintext);
      expect(decrypted2.value).toBe(plaintext);
    });

    it("returns an error for unsupported algorithm", () => {
      const encryptedResult = encryptProviderCredential("test");
      if (isErr(encryptedResult)) {
        throw new Error("expected encryption to succeed");
      }
      const invalidEncrypted = { ...encryptedResult.value, algorithm: "unsupported-algo" };

      const decryptedResult = decryptProviderCredential(invalidEncrypted);
      expect(decryptedResult.ok).toBe(false);
      if (!isErr(decryptedResult)) {
        throw new Error("expected decryption to fail");
      }
      expect(decryptedResult.error.code).toBe("unsupported_provider_credential_algorithm");
    });

    it("returns an error for unsupported key version", () => {
      const encryptedResult = encryptProviderCredential("test");
      if (isErr(encryptedResult)) {
        throw new Error("expected encryption to succeed");
      }
      const invalidEncrypted = { ...encryptedResult.value, keyVersion: 999 };

      const decryptedResult = decryptProviderCredential(invalidEncrypted);
      expect(decryptedResult.ok).toBe(false);
      if (!isErr(decryptedResult)) {
        throw new Error("expected decryption to fail");
      }
      expect(decryptedResult.error.code).toBe("unsupported_provider_credential_key_version");
    });

    it("returns an error when ciphertext is tampered with", () => {
      const encryptedResult = encryptProviderCredential("sensitive-data");
      if (isErr(encryptedResult)) {
        throw new Error("expected encryption to succeed");
      }

      const tamperedCiphertext = encryptedResult.value.ciphertext.replace(/./, (c) =>
        c === "A" ? "B" : "A",
      );
      const tamperedEncrypted = { ...encryptedResult.value, ciphertext: tamperedCiphertext };

      const decryptedResult = decryptProviderCredential(tamperedEncrypted);
      expect(decryptedResult.ok).toBe(false);
      if (!isErr(decryptedResult)) {
        throw new Error("expected decryption to fail");
      }
      expect(decryptedResult.error.code).toBe("provider_credential_decryption_failed");
    });

    it("returns an error when auth tag is tampered with", () => {
      const encryptedResult = encryptProviderCredential("sensitive-data");
      if (isErr(encryptedResult)) {
        throw new Error("expected encryption to succeed");
      }

      const tamperedAuthTag = encryptedResult.value.authTag.replace(/./, (c) =>
        c === "A" ? "B" : "A",
      );
      const tamperedEncrypted = { ...encryptedResult.value, authTag: tamperedAuthTag };

      const decryptedResult = decryptProviderCredential(tamperedEncrypted);
      expect(decryptedResult.ok).toBe(false);
      if (!isErr(decryptedResult)) {
        throw new Error("expected decryption to fail");
      }
      expect(decryptedResult.error.code).toBe("provider_credential_decryption_failed");
    });
  });
});
