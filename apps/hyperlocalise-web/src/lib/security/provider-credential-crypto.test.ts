import { describe, expect, it } from "vite-plus/test";
import { maskProviderCredentialSuffix } from "./provider-credential-crypto";

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
