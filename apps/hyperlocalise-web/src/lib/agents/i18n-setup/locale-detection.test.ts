import { describe, expect, it } from "vite-plus/test";

import { detectLocaleFiles, extractLocaleFromPath } from "./locale-detection";
import { generateI18nConfigYaml } from "./generate-i18n-config";
import {
  buildI18nSetupSuggestion,
  mergeI18nConfigWithDetection,
  parseI18nConfigJsonc,
  parseI18nConfigYaml,
} from "./merge-i18n-config";

describe("extractLocaleFromPath", () => {
  it("extracts locale from filename stem", () => {
    expect(extractLocaleFromPath("apps/web/lang/en-US.json")).toBe("en-US");
    expect(extractLocaleFromPath("locales/fr.json")).toBe("fr");
  });

  it("extracts locale from parent directory", () => {
    expect(extractLocaleFromPath("messages/en-US/common.json")).toBe("en-US");
  });

  it("supports popular translation formats", () => {
    expect(extractLocaleFromPath("locales/en-US.po")).toBe("en-US");
    expect(extractLocaleFromPath("locales/fr.yaml")).toBe("fr");
    expect(extractLocaleFromPath("locales/de.yml")).toBe("de");
    expect(extractLocaleFromPath("locales/es-ES.xlf")).toBe("es-ES");
    expect(extractLocaleFromPath("lib/l10n/en.arb")).toBe("en");
    expect(extractLocaleFromPath("ios/en.lproj/Localizable.strings")).toBeNull();
    expect(extractLocaleFromPath("l10n/en-US.strings")).toBe("en-US");
    expect(extractLocaleFromPath("App/en.xcstrings")).toBe("en");
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

  it("detects PO locale groups", () => {
    const result = detectLocaleFiles(["locales/en-US.po", "locales/es-ES.po"]);

    expect(result?.groups[0]?.pathPattern).toEqual({
      from: "locales/{{source}}.po",
      to: "locales/{{target}}.po",
    });
  });

  it("returns null when no locale files are found", () => {
    expect(detectLocaleFiles(["src/index.ts", "package.json"])).toBeNull();
  });

  it("keeps sibling files under the same locale directory", () => {
    const result = detectLocaleFiles([
      "messages/en/common.json",
      "messages/en/errors.json",
      "messages/fr/common.json",
      "messages/fr/errors.json",
    ]);

    expect(result?.groups).toHaveLength(2);
    expect(result?.groups.map((group) => group.pathPattern)).toEqual(
      expect.arrayContaining([
        { from: "messages/{{source}}/common.json", to: "messages/{{target}}/common.json" },
        { from: "messages/{{source}}/errors.json", to: "messages/{{target}}/errors.json" },
      ]),
    );
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

  it("uses the detected file extension in fallback buckets", () => {
    const detection = detectLocaleFiles(["locales/en-US.po", "locales/es-ES.po"]);

    expect(detection).not.toBeNull();
    const yaml = generateI18nConfigYaml(detection!);

    expect(yaml).toContain("from: locales/{{source}}.po");
    expect(yaml).toContain("to: locales/{{target}}.po");
  });
});

describe("mergeI18nConfigWithDetection", () => {
  const existingYaml = `locales:
  source: en-US
  targets:
    - es-ES
buckets:
  ui:
    files:
      - from: locales/{{source}}.json
        to: locales/{{target}}.json
llm:
  profiles:
    default:
      provider: openai
      model: gpt-4.1
`;

  it("adds newly discovered target locales and buckets", () => {
    const existing = parseI18nConfigYaml(existingYaml);
    const detection = detectLocaleFiles([
      "locales/en-US.json",
      "locales/es-ES.json",
      "locales/fr-FR.json",
      "messages/en-US/common.po",
      "messages/fr-FR/common.po",
    ]);

    expect(existing).not.toBeNull();
    expect(detection).not.toBeNull();

    const merged = mergeI18nConfigWithDetection(existing!, detection!);

    expect(merged.hasChanges).toBe(true);
    expect(merged.addedTargetLocales).toEqual(["fr-FR"]);
    expect(merged.addedFileMappings).toEqual([
      {
        from: "messages/{{source}}/common.po",
        to: "messages/{{target}}/common.po",
      },
    ]);
    expect(merged.config.locales.targets).toEqual(["es-ES", "fr-FR"]);
    expect(merged.config.llm?.profiles).toEqual({
      default: {
        provider: "openai",
        model: "gpt-4.1",
      },
    });
    expect(merged.yaml).toContain("model: gpt-4.1");
  });

  it("reports no changes when config already covers discovered files", () => {
    const existing = parseI18nConfigYaml(existingYaml);
    const detection = detectLocaleFiles(["locales/en-US.json", "locales/es-ES.json"]);

    expect(existing).not.toBeNull();
    expect(detection).not.toBeNull();

    const merged = mergeI18nConfigWithDetection(existing!, detection!);

    expect(merged.hasChanges).toBe(false);
    expect(merged.addedTargetLocales).toEqual([]);
    expect(merged.addedFileMappings).toEqual([]);
  });
});

describe("parseI18nConfigJsonc", () => {
  it("parses jsonc with comments and trailing commas", () => {
    const jsonc = `{
      // legacy config
      "locales": {
        "source": "en-US",
        "targets": ["es-ES",],
      },
      "buckets": {
        "ui": {
          "files": [{ "from": "locales/{{source}}.json", "to": "locales/{{target}}.json" }],
        },
      },
      "llm": {
        "profiles": {
          "default": { "provider": "openai", "model": "gpt-4.1" },
        },
      },
    }`;

    const parsed = parseI18nConfigJsonc(jsonc);

    expect(parsed).toMatchObject({
      locales: { source: "en-US", targets: ["es-ES"] },
      buckets: {
        ui: {
          files: [{ from: "locales/{{source}}.json", to: "locales/{{target}}.json" }],
        },
      },
    });
  });
});

describe("buildI18nSetupSuggestion", () => {
  it("converts jsonc to yaml and merges newly discovered locale files", () => {
    const jsonc = `{
      "locales": { "source": "en-US", "targets": ["es-ES"] },
      "buckets": {
        "ui": {
          "files": [{ "from": "locales/{{source}}.json", "to": "locales/{{target}}.json" }]
        }
      },
      "llm": { "profiles": { "default": { "provider": "openai", "model": "gpt-4.1" } } }
    }`;
    const detection = detectLocaleFiles([
      "locales/en-US.json",
      "locales/es-ES.json",
      "locales/fr-FR.json",
    ]);

    expect(detection).not.toBeNull();

    const suggestion = buildI18nSetupSuggestion(detection!, { kind: "jsonc", content: jsonc });

    expect(suggestion).not.toHaveProperty("error");
    if ("error" in suggestion) {
      return;
    }

    expect(suggestion.mode).toBe("convert");
    expect(suggestion.removeJsonc).toBe(true);
    expect(suggestion.hasChanges).toBe(true);
    expect(suggestion.yaml).toContain("source: en-US");
    expect(suggestion.yaml).toContain("- fr-FR");
    expect(suggestion.yaml).toContain("model: gpt-4.1");
  });
});
