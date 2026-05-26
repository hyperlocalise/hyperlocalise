import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";

import {
  assertGitHubAppPrivateKeyParsable,
  isGitHubAppPrivateKeyDecoderError,
  normalizeGitHubAppPrivateKey,
} from "./private-key";

const { privateKey: samplePem } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function expectParsablePem(normalized: string) {
  expect(normalized).toContain("-----BEGIN");
  expect(normalized).toContain("-----END");
  expect(() => assertGitHubAppPrivateKeyParsable(normalized)).not.toThrow();
  expect(() => createPrivateKey({ key: normalized })).not.toThrow();
}

describe("normalizeGitHubAppPrivateKey", () => {
  it("accepts PEM with real newlines", () => {
    const normalized = normalizeGitHubAppPrivateKey(samplePem);
    expectParsablePem(normalized);
  });

  it("unescapes literal \\n sequences", () => {
    const escaped = samplePem.replaceAll("\n", "\\n");
    const normalized = normalizeGitHubAppPrivateKey(escaped);
    expectParsablePem(normalized);
  });

  it("unescapes repeatedly escaped \\n sequences", () => {
    const escaped = samplePem.replaceAll("\n", "\\\\n");
    const normalized = normalizeGitHubAppPrivateKey(escaped);
    expectParsablePem(normalized);
  });

  it("strips wrapping quotes", () => {
    const quoted = `"${samplePem.replaceAll("\n", "\\n")}"`;
    const normalized = normalizeGitHubAppPrivateKey(quoted);
    expectParsablePem(normalized);
  });

  it("decodes base64-encoded PEM blobs", () => {
    const base64 = Buffer.from(samplePem, "utf8").toString("base64");
    const normalized = normalizeGitHubAppPrivateKey(base64);
    expectParsablePem(normalized);
  });

  it("normalizes CRLF line endings", () => {
    const crlf = samplePem.replaceAll("\n", "\r\n");
    const normalized = normalizeGitHubAppPrivateKey(crlf);
    expectParsablePem(normalized);
  });
});

describe("assertGitHubAppPrivateKeyParsable", () => {
  it("rejects non-PEM placeholders", () => {
    expect(() => assertGitHubAppPrivateKeyParsable("test-github-app-private-key")).toThrow(
      "invalid GitHub App private key PEM format",
    );
  });
});

describe("isGitHubAppPrivateKeyDecoderError", () => {
  it("detects OpenSSL decoder failures", () => {
    expect(
      isGitHubAppPrivateKeyDecoderError(new Error("error:1E08010C:DECODER routines::unsupported")),
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isGitHubAppPrivateKeyDecoderError(new Error("Not Found"))).toBe(false);
  });
});
