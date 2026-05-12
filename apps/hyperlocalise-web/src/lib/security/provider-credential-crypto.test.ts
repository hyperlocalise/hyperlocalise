import "dotenv/config";

import { describe, expect, it } from "vite-plus/test";
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
      const encrypted = encryptProviderCredential(plaintext);

      expect(encrypted.ciphertext).not.toBe(plaintext);
      expect(encrypted.algorithm).toBe("aes-256-gcm");

      const decrypted = decryptProviderCredential(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("produces different ciphertexts for the same plaintext (random IV)", () => {
      const plaintext = "sk-proj-test-secret-key-12345";
      const encrypted1 = encryptProviderCredential(plaintext);
      const encrypted2 = encryptProviderCredential(plaintext);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);

      expect(decryptProviderCredential(encrypted1)).toBe(plaintext);
      expect(decryptProviderCredential(encrypted2)).toBe(plaintext);
    });

    it("throws an error for unsupported algorithm", () => {
      const encrypted = encryptProviderCredential("test");
      const invalidEncrypted = { ...encrypted, algorithm: "unsupported-algo" };

      expect(() => decryptProviderCredential(invalidEncrypted)).toThrow(
        "unsupported_provider_credential_algorithm",
      );
    });

    it("throws an error for unsupported key version", () => {
      const encrypted = encryptProviderCredential("test");
      const invalidEncrypted = { ...encrypted, keyVersion: 999 };

      expect(() => decryptProviderCredential(invalidEncrypted)).toThrow(
        "unsupported_provider_credential_key_version",
      );
    });

    it("throws an error when ciphertext is tampered with", () => {
      const encrypted = encryptProviderCredential("sensitive-data");

      // Corrupt the ciphertext by changing characters in the base64 string
      // We use a regex that matches any character to ensure we actually change something
      const tamperedCiphertext = encrypted.ciphertext.replace(/./, (c) => (c === "A" ? "B" : "A"));
      const tamperedEncrypted = { ...encrypted, ciphertext: tamperedCiphertext };

      // AES-GCM should detect tampering via the auth tag
      expect(() => decryptProviderCredential(tamperedEncrypted)).toThrow();
    });

    it("throws an error when auth tag is tampered with", () => {
      const encrypted = encryptProviderCredential("sensitive-data");

      const tamperedAuthTag = encrypted.authTag.replace(/./, (c) => (c === "A" ? "B" : "A"));
      const tamperedEncrypted = { ...encrypted, authTag: tamperedAuthTag };

      expect(() => decryptProviderCredential(tamperedEncrypted)).toThrow();
    });
  });
});
