import { describe, expect, it } from "vite-plus/test";
import { generateApiKey, getApiKeyPrefix, hashApiKey } from "./api-keys";

describe("api-keys", () => {
  describe("generateApiKey", () => {
    it("generates a key with the hl_ prefix", () => {
      const key = generateApiKey();
      expect(key.startsWith("hl_")).toBe(true);
    });

    it("generates a unique key each time", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });

    it("generates a key of expected length", () => {
      const key = generateApiKey();
      // hl_ (3) + 32 bytes base64url (approx 43-44 chars)
      expect(key.length).toBeGreaterThan(40);
    });
  });

  describe("hashApiKey", () => {
    it("produces a consistent SHA-256 hash in hex", () => {
      const key = "hl_test_key";
      const hash = hashApiKey(key);
      // echo -n "hl_test_key" | openssl dgst -sha256
      // dc5371ae9c00ad488f90d632b68010cb8a019e2e944d741d4cb4a6e7e7a767b0
      expect(hash).toBe("dc5371ae9c00ad488f90d632b68010cb8a019e2e944d741d4cb4a6e7e7a767b0");
    });
  });

  describe("getApiKeyPrefix", () => {
    it("extracts the first 8 characters of a key", () => {
      const key = "hl_abcdefghijklmnopqrstuvwxyz";
      expect(getApiKeyPrefix(key)).toBe("hl_abcde");
    });

    it("handles short keys by returning whatever is available", () => {
      const key = "hl_";
      expect(getApiKeyPrefix(key)).toBe("hl_");
    });
  });
});
