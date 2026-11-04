import { describe, expect, it } from "vite-plus/test";

import {
  classifyContentSyncPath,
  compileContentSyncPathTemplate,
  hasSafeContentSyncTemplateWildcards,
  resolveContentSyncLocale,
} from "./content-sync-locale-paths";

describe("compileContentSyncPathTemplate", () => {
  it("matches a language code in a file name, a folder, or both", () => {
    const flat = compileContentSyncPathTemplate("{{locale}}.json");
    expect(flat.match("en.json")).toBe("en");
    expect(flat.match("pt-BR.json")).toBe("pt-BR");
    expect(flat.match("nested/en.json")).toBeNull();
    expect(flat.match("en.json.bak")).toBeNull();

    const folder = compileContentSyncPathTemplate("{{locale}}/pages/*.html");
    expect(folder.match("en/pages/home.html")).toBe("en");
    expect(folder.match("en/pages/deeper/home.html")).toBeNull();

    const deep = compileContentSyncPathTemplate("{{locale}}/**/*.html");
    expect(deep.match("en/pages/deeper/home.html")).toBe("en");
    expect(deep.match("en/home.html")).toBe("en");

    const twice = compileContentSyncPathTemplate("{{locale}}/{{locale}}.json");
    expect(twice.match("fr/fr.json")).toBe("fr");
    expect(twice.match("fr/de.json")).toBeNull();
  });

  it("collapses runs of wildcards so a long template still matches quickly", () => {
    const repeated = compileContentSyncPathTemplate(
      "**/**/**/**/**/**/**/**/**/**/{{locale}}.json",
    );
    const deep = `${"a/".repeat(30)}x.txt`;
    const started = Date.now();
    expect(repeated.match(deep)).toBeNull();
    expect(repeated.match("a/b/fr.json")).toBe("fr");
    expect(Date.now() - started).toBeLessThan(200);
    expect(compileContentSyncPathTemplate("***/{{locale}}.json").match("a/b/en.json")).toBe("en");
  });

  it("allows only wildcards that match quickly", () => {
    for (const template of ["{{locale}}/**/*.html", "**/{{locale}}.*.json", "*-{{locale}}.json"]) {
      expect(hasSafeContentSyncTemplateWildcards(template)).toBe(true);
    }
    for (const template of [
      "*a*a*{{locale}}.json",
      "{{locale}}**x**y",
      "*/*/*/*/*/*/*/*/*/{{locale}}.json",
      "{{locale}}-{{locale}}-{{locale}}.json",
      "*-*-{{locale}}.json",
      "**/a/**/b/**/{{locale}}.json",
    ]) {
      expect(hasSafeContentSyncTemplateWildcards(template)).toBe(false);
    }
  });

  it("rewrites the language code in a path, wherever the placeholder sits", () => {
    expect(compileContentSyncPathTemplate("{{locale}}.json").rewriteLocale("en.json", "fr")).toBe(
      "fr.json",
    );
    expect(
      compileContentSyncPathTemplate("{{locale}}/pages/*.html").rewriteLocale(
        "en/pages/pricing.html",
        "fr-FR",
      ),
    ).toBe("fr-FR/pages/pricing.html");
    expect(
      compileContentSyncPathTemplate("{{locale}}/**/{{locale}}.json").rewriteLocale(
        "en/a/b/en.json",
        "de",
      ),
    ).toBe("de/a/b/de.json");
    expect(compileContentSyncPathTemplate("{{locale}}.json").rewriteLocale("notes.txt", "fr")).toBe(
      null,
    );
  });

  it("names no language without the placeholder, so nothing matches", () => {
    const fixed = compileContentSyncPathTemplate("/source/*.json/");
    expect(fixed.match("source/app.json")).toBe("");
    expect(fixed.match("source/sub/app.json")).toBeNull();
  });

  it("escapes characters that mean something in a pattern", () => {
    const template = compileContentSyncPathTemplate("messages.{{locale}}.(v1).json");
    expect(template.match("messages.en.(v1).json")).toBe("en");
    expect(template.match("messages.en.xv1x.json")).toBeNull();
  });
});

describe("resolveContentSyncLocale", () => {
  it("takes the same tag whatever its case or separator", () => {
    const locales = ["en-US", "fr-FR", "pt-BR"];
    expect(resolveContentSyncLocale({ code: "pt-br", locales })).toBe("pt-BR");
    expect(resolveContentSyncLocale({ code: "pt_BR", locales })).toBe("pt-BR");
    expect(resolveContentSyncLocale({ code: "FR-fr", locales })).toBe("fr-FR");
  });

  it("falls back to the one project locale of the same language, never to one of two", () => {
    expect(resolveContentSyncLocale({ code: "fr", locales: ["en-US", "fr-FR"] })).toBe("fr-FR");
    // A regional code names that region only, never a bare locale or another region.
    expect(resolveContentSyncLocale({ code: "en-US", locales: ["en", "fr-FR"] })).toBeNull();
    expect(resolveContentSyncLocale({ code: "en-GB", locales: ["en-US", "fr-FR"] })).toBeNull();
    expect(resolveContentSyncLocale({ code: "zh-TW", locales: ["zh-CN"] })).toBeNull();
    expect(resolveContentSyncLocale({ code: "en", locales: ["en-US", "en-GB"] })).toBeNull();
    expect(resolveContentSyncLocale({ code: "es", locales: ["en-US", "fr-FR"] })).toBeNull();
  });
});

describe("classifyContentSyncPath", () => {
  const template = compileContentSyncPathTemplate("{{locale}}.json");
  const base = { template, sourceLocale: "en-US", targetLocales: ["fr-FR", "de-DE"] };

  it("tells source files from translation files and leaves unknown codes alone", () => {
    expect(classifyContentSyncPath({ ...base, relativePath: "en.json" })).toEqual({
      kind: "source",
      locale: "en-US",
    });
    expect(classifyContentSyncPath({ ...base, relativePath: "fr.json" })).toEqual({
      kind: "translation",
      locale: "fr-FR",
    });
    expect(classifyContentSyncPath({ ...base, relativePath: "de-DE.json" })).toEqual({
      kind: "translation",
      locale: "de-DE",
    });
    // Only the exact code is source text: a British file beside the American one is neither.
    expect(classifyContentSyncPath({ ...base, relativePath: "en-GB.json" })).toEqual({
      kind: "unmatched",
    });
    expect(
      classifyContentSyncPath({ ...base, sourceLocale: "en", relativePath: "en-US.json" }),
    ).toEqual({ kind: "unmatched" });
    expect(classifyContentSyncPath({ ...base, relativePath: "fr-CA.json" })).toEqual({
      kind: "unmatched",
    });
    // The project has no Spanish, so its file is neither source nor a known translation.
    expect(classifyContentSyncPath({ ...base, relativePath: "es.json" })).toEqual({
      kind: "unmatched",
    });
    expect(classifyContentSyncPath({ ...base, relativePath: "README.md" })).toEqual({
      kind: "unmatched",
    });
  });

  it("never imports a file whose template names no language", () => {
    expect(
      classifyContentSyncPath({
        ...base,
        template: compileContentSyncPathTemplate("source/*.json"),
        relativePath: "source/fr.json",
      }),
    ).toEqual({ kind: "unmatched" });
  });
});
