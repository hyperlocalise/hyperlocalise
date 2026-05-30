import { describe, expect, it } from "vite-plus/test";

import { detectLocaleFiles, extractLocaleFromPath } from "./locale-detection";
import { generateI18nConfigYaml } from "./generate-i18n-config";

describe("extractLocaleFromPath", () => {
  it("extracts locale from filename stem", () => {
    expect(extractLocaleFromPath("apps/web/lang/en-US.json")).toBe("en-US");
    expect(extractLocaleFromPath("locales/fr.json")).toBe("fr");
  });

  it("extracts locale from parent directory", () => {
    expect(extractLocaleFromPath("messages/en-US/common.json")).toBe("en-US");
  });

  it("ignores non-translation paths", () => {
    expect(extractLocaleFromPath("node_modules/pkg/en-US.json")).toBeNull();
    expect(extractLocaleFromPath("README.md")).toBeNull();
  });
});

describe("detectLocaleFiles", () => {
  it("detects source and targets from locale file paths", () => {
    const result = detectLocaleFiles([
      "apps/web/lang/en-US.json",
      "apps/web/lang/es-ES.json",
      "apps/web/lang/fr-FR.json",
    ]);

    expect(result).toMatchObject({
      sourceLocale: "en-US",
      targetLocales: ["es-ES", "fr-FR"],
    });
    expect(result?.groups).toHaveLength(1);
    expect(result?.groups[0]?.pathPattern).toEqual({
      from: "apps/web/lang/{{source}}.json",
      to: "apps/web/lang/{{target}}.json",
    });
  });

  it("returns null when no locale files are found", () => {
    expect(detectLocaleFiles(["src/index.ts", "package.json"])).toBeNull();
  });
});

describe("generateI18nConfigYaml", () => {
  it("generates a runnable config from detection output", () => {
    const detection = detectLocaleFiles(["locales/en-US.json", "locales/es-ES.json"]);

    expect(detection).not.toBeNull();
    const yaml = generateI18nConfigYaml(detection!);

    expect(yaml).toContain("source: en-US");
    expect(yaml).toContain("- es-ES");
    expect(yaml).toContain("from: locales/{{source}}.json");
    expect(yaml).toContain("to: locales/{{target}}.json");
    expect(yaml).toContain("provider: openai");
  });
});
