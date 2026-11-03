import { describe, expect, it } from "vite-plus/test";

import {
  classifyContentSyncPath,
  compileContentSyncPathTemplate,
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

  it("treats a template without the placeholder as naming source files only", () => {
    const fixed = compileContentSyncPathTemplate("/source/*.json/");
    expect(fixed.usesLocale).toBe(false);
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
  it("goes through the configured codes before the locale itself, ignoring case", () => {
    const locales = ["en-US", "fr-FR", "pt-BR"];
    expect(resolveContentSyncLocale({ code: "fr", locales, localeCodes: { "fr-FR": "fr" } })).toBe(
      "fr-FR",
    );
    expect(resolveContentSyncLocale({ code: "pt-br", locales })).toBe("pt-BR");
    expect(resolveContentSyncLocale({ code: "fr", locales })).toBeNull();
  });
});

describe("classifyContentSyncPath", () => {
  const template = compileContentSyncPathTemplate("{{locale}}.json");
  const base = { template, sourceLocale: "en-US", targetLocales: ["fr-FR", "de-DE"] };

  it("tells source files from translation files and leaves unknown codes alone", () => {
    const localeCodes = { "en-US": "en", "fr-FR": "fr" };
    expect(classifyContentSyncPath({ ...base, relativePath: "en.json", localeCodes })).toEqual({
      kind: "source",
      locale: "en-US",
    });
    expect(classifyContentSyncPath({ ...base, relativePath: "fr.json", localeCodes })).toEqual({
      kind: "translation",
      locale: "fr-FR",
    });
    expect(classifyContentSyncPath({ ...base, relativePath: "de-DE.json", localeCodes })).toEqual({
      kind: "translation",
      locale: "de-DE",
    });
    // No code for Spanish, so its file is neither source nor a known translation.
    expect(classifyContentSyncPath({ ...base, relativePath: "es.json", localeCodes })).toEqual({
      kind: "unmatched",
    });
    expect(classifyContentSyncPath({ ...base, relativePath: "README.md", localeCodes })).toEqual({
      kind: "unmatched",
    });
  });

  it("imports every match of a template without the placeholder as source", () => {
    expect(
      classifyContentSyncPath({
        ...base,
        template: compileContentSyncPathTemplate("source/*.json"),
        relativePath: "source/fr.json",
      }),
    ).toEqual({ kind: "source", locale: "en-US" });
  });
});
