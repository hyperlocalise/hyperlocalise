import { describe, expect, it } from "vite-plus/test";

import { resolveLocale } from "./locale";
import { namespaceFromPath, parseManifest, type OtaManifest } from "./manifest";

const valid = {
  schema_version: 1,
  format: "json",
  files: ["/messages.json"],
  languages: ["fr-FR", "pt-BR", "pt-PT", "en"],
  language_mapping: { "pt-AO": "pt-PT" },
  timestamp: 1756961280,
  content: { "fr-FR": ["/content/fr-FR/messages.json"] },
};

describe("parseManifest", () => {
  it("accepts a schema 1 manifest", () => {
    expect(parseManifest(valid)).toEqual(valid);
  });

  it.each([
    ["not an object", []],
    ["a future schema", { ...valid, schema_version: 2 }],
    ["an unknown format", { ...valid, format: "yaml" }],
    ["a missing timestamp", { ...valid, timestamp: "now" }],
    ["bad content paths", { ...valid, content: { fr: "/x" } }],
  ])("rejects %s", (_label, value) => {
    expect(() => parseManifest(value)).toThrow(
      expect.objectContaining({ code: "invalid_manifest" }),
    );
  });
});

describe("resolveLocale", () => {
  const manifest = parseManifest(valid) as OtaManifest;

  it.each([
    ["fr-FR", "fr-FR"],
    ["fr_fr", "fr-FR"],
    ["fr", "fr-FR"],
    ["fr-CA", "fr-FR"],
    ["pt-AO", "pt-PT"],
    ["pt", "pt-PT"],
    ["en-GB", "en"],
    ["ja", undefined],
  ])("%s → %s", (requested, expected) => {
    expect(resolveLocale(manifest, requested)).toBe(expected);
  });
});

describe("namespaceFromPath", () => {
  it("uses the basename without extension", () => {
    expect(namespaceFromPath("/content/fr-FR/messages.json")).toBe("messages");
    expect(namespaceFromPath("/content/fr-FR/Localizable.strings")).toBe("Localizable");
    expect(namespaceFromPath("/content/fr-FR/README")).toBe("README");
  });
});
