import { describe, expect, it } from "vite-plus/test";

import { detectLocaleFiles } from "./locale-detection";
import { buildSuggestedI18nConfigYaml } from "./merge-i18n-config";
import {
  buildDetectionFromTmsHints,
  collectTmsHints,
  formatTmsHintsSummary,
  mergeTmsHintsIntoDetection,
  parseCrowdinConfigHints,
  parseI18nStorageHints,
  parsePhraseConfigHints,
} from "./tms-config-hints";

describe("parseCrowdinConfigHints", () => {
  it("extracts locale mappings from crowdin.yml", () => {
    const hint = parseCrowdinConfigHints(
      "crowdin.yml",
      `
files:
  - source: /locales/en.json
    translation: /locales/%locale%/%original_file_name%
export_languages:
  - fr
  - de
`,
    );

    expect(hint).toMatchObject({
      provider: "crowdin",
      sourceLocale: "en",
      targetLocales: ["de", "fr"],
      fileMappings: [
        {
          from: "locales/{{source}}.json",
          to: "locales/{{target}}/en.json",
        },
      ],
    });
  });

  it("converts directory-based crowdin locale layouts", () => {
    const hint = parseCrowdinConfigHints(
      "crowdin.yml",
      `
files:
  - source: /messages/en/common.json
    translation: /messages/%locale%/common.json
`,
    );

    expect(hint?.fileMappings?.[0]).toEqual({
      from: "messages/{{source}}/common.json",
      to: "messages/{{target}}/common.json",
    });
    expect(hint?.sourceLocale).toBe("en");
  });
});

describe("parsePhraseConfigHints", () => {
  it("extracts locale mappings from .phrase.yml", () => {
    const hint = parsePhraseConfigHints(
      ".phrase.yml",
      `
phrase:
  project_id: project-1
  file_format: json
  push:
    sources:
      - file: ./locales/en.json
        params:
          locale_id: en-US
  pull:
    targets:
      - file: ./locales/<locale_name>.json
        params:
          locale_id: fr-FR
`,
    );

    expect(hint).toMatchObject({
      provider: "phrase",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      fileMappings: [
        {
          from: "locales/{{source}}.json",
          to: "locales/{{target}}.json",
        },
      ],
    });
  });
});

describe("parseI18nStorageHints", () => {
  it("reads lokalise adapter settings from i18n.jsonc", () => {
    const hint = parseI18nStorageHints(
      "i18n.jsonc",
      `{
        "locales": { "source": "en-US", "targets": ["es-ES"] },
        "buckets": {
          "ui": {
            "files": [{ "from": "locales/{{source}}.json", "to": "locales/{{target}}.json" }]
          }
        },
        "storage": {
          "adapter": "lokalise",
          "config": {
            "sourceLanguage": "en",
            "targetLanguages": ["fr", "de"]
          }
        }
      }`,
      "jsonc",
    );

    expect(hint).toMatchObject({
      provider: "lokalise",
      sourceLocale: "en",
      targetLocales: ["de", "fr"],
      storageAdapter: "lokalise",
    });
  });

  it("reads smartling adapter settings from i18n.yml", () => {
    const hint = parseI18nStorageHints(
      "i18n.yml",
      `locales:
  source: en-US
  targets:
    - es-ES
buckets:
  ui:
    files:
      - from: locales/{{source}}.json
        to: locales/{{target}}.json
storage:
  adapter: smartling
  config:
    projectID: proj-1
    sourceLanguage: en-US
    targetLanguages:
      - fr-FR
`,
      "yml",
    );

    expect(hint).toMatchObject({
      provider: "smartling",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    });
  });
});

describe("mergeTmsHintsIntoDetection", () => {
  it("prefers crowdin bucket patterns when enhancing scanned detection", () => {
    const detection = detectLocaleFiles(["locales/en.json", "locales/fr.json"]);
    const crowdinHint = parseCrowdinConfigHints(
      "crowdin.yml",
      `
files:
  - source: /locales/en.json
    translation: /locales/%locale%/%original_file_name%
`,
    );

    expect(detection).not.toBeNull();
    expect(crowdinHint).not.toBeNull();

    const merged = mergeTmsHintsIntoDetection(detection!, [crowdinHint!]);

    expect(
      merged?.groups.some((group) => group.pathPattern.to === "locales/{{target}}/en.json"),
    ).toBe(true);
  });

  it("builds detection from TMS hints when locale scan finds nothing", () => {
    const crowdinHint = parseCrowdinConfigHints(
      "crowdin.yml",
      `
files:
  - source: /locales/en.json
    translation: /locales/%locale%.json
export_languages:
  - es-ES
`,
    );

    expect(crowdinHint).not.toBeNull();

    const detection = buildDetectionFromTmsHints([crowdinHint!]);
    const yaml = buildSuggestedI18nConfigYaml(detection!, null).yaml;

    expect(detection).toMatchObject({
      sourceLocale: "en",
      targetLocales: ["es-ES"],
    });
    expect(yaml).toContain("source: en");
    expect(yaml).toContain("- es-ES");
    expect(yaml).toContain("from: locales/{{source}}.json");
  });
});

describe("collectTmsHints", () => {
  it("combines TMS config files with existing i18n storage hints", () => {
    const hints = collectTmsHints(
      [
        {
          path: "crowdin.yml",
          content: `
files:
  - source: /locales/en.json
    translation: /locales/%locale%.json
`,
        },
      ],
      {
        kind: "jsonc",
        content: `{
          "locales": { "source": "en-US", "targets": ["es-ES"] },
          "buckets": {
            "ui": {
              "files": [{ "from": "locales/{{source}}.json", "to": "locales/{{target}}.json" }]
            }
          },
          "storage": { "adapter": "lokalise", "config": { "projectID": "123" } }
        }`,
      },
    );

    expect(hints).toHaveLength(2);
    expect(hints.map((hint) => hint.provider)).toEqual(["crowdin", "lokalise"]);
  });
});

describe("formatTmsHintsSummary", () => {
  it("formats hints for agent instructions", () => {
    const summary = formatTmsHintsSummary([
      {
        provider: "crowdin",
        configPath: "crowdin.yml",
        sourceLocale: "en",
        fileMappings: [{ from: "locales/{{source}}.json", to: "locales/{{target}}.json" }],
      },
    ]);

    expect(summary).toContain("- crowdin (crowdin.yml)");
    expect(summary).toContain("source locale: en");
    expect(summary).toContain("locales/{{source}}.json -> locales/{{target}}.json");
  });
});
