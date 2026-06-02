import { describe, expect, it } from "vite-plus/test";

import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

describe("contentful connection credential handling", () => {
  it("encrypts Contentful Management API tokens before persistence", () => {
    const token = "cma_test_plaintext_token";
    const encrypted = unwrapProviderCredentialCrypto(encryptProviderCredential(token));

    expect(encrypted.ciphertext).not.toContain(token);
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.authTag).toBeTruthy();
    expect(maskProviderCredentialSuffix(token)).toBe("••••oken");

    const decrypted = unwrapProviderCredentialCrypto(decryptProviderCredential(encrypted));
    expect(decrypted).toBe(token);
  });
});
