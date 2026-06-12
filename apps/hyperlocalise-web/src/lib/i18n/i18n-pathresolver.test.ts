import { describe, expect, it } from "vite-plus/test";

import { resolveSourcePath, resolveTargetPath } from "./i18n-pathresolver";

describe("i18n-pathresolver", () => {
  it("resolves source paths with locale tokens", () => {
    expect(resolveSourcePath("locales/{{source}}.json", "en")).toBe("locales/en.json");
  });

  it("resolves target paths with locale directory tokens", () => {
    expect(resolveTargetPath("locales/{{localeDir}}/messages.json", "en", "fr")).toBe(
      "locales/fr/messages.json",
    );
  });

  it("resolves legacy [locale] placeholders", () => {
    expect(resolveTargetPath("locales/[locale]/messages.json", "en", "de")).toBe(
      "locales/de/messages.json",
    );
  });

  it("handles empty {{localeDir}} at the start of a pattern when source matches target", () => {
    expect(resolveTargetPath("{{localeDir}}/messages.json", "en", "en")).toBe("messages.json");
  });
});
