import { describe, expect, it } from "vite-plus/test";

import type { ExternalTmsTranslationUnit } from "@/lib/providers/external-tms-content-sync";

import { collectUnitQaFindings } from "./checks";
import { parseTextInvariant, sameIcuBlocks, samePlaceholderSet } from "./invariant";
import { runProviderJobQa } from "./run-provider-job-qa";

function unit(overrides: Partial<ExternalTmsTranslationUnit> = {}): ExternalTmsTranslationUnit {
  return {
    externalStringId: "1",
    key: "greeting",
    sourceText: "Hello {name}",
    translations: [],
    ...overrides,
  };
}

const baseOptions = {
  targetLocales: ["fr"],
  glossaryTerms: [],
};

describe("parseTextInvariant", () => {
  it("extracts simple placeholders and plural blocks", () => {
    const invariant = parseTextInvariant("{count, plural, one {# item} other {# items}}");
    expect(invariant.placeholders).toEqual(["count"]);
    expect(invariant.icuBlocks).toEqual([
      { arg: "count", type: "plural", options: ["one", "other"] },
    ]);
  });
});

describe("provider job QA checks", () => {
  it("reports placeholder_mismatch", () => {
    const findings = collectUnitQaFindings(
      unit({
        sourceText: "Hello {name}",
        translations: [{ locale: "fr", text: "Bonjour" }],
      }),
      baseOptions,
    );

    expect(findings.some((finding) => finding.checkType === "placeholder_mismatch")).toBe(true);
  });

  it("reports icu_shape_mismatch", () => {
    const findings = collectUnitQaFindings(
      unit({
        sourceText: "{count, plural, one {# item} other {# items}}",
        translations: [{ locale: "fr", text: "{count, select, one {# item} other {# items}}" }],
      }),
      baseOptions,
    );

    expect(findings.some((finding) => finding.checkType === "icu_shape_mismatch")).toBe(true);
  });

  it("reports invalid_icu_structure", () => {
    const findings = collectUnitQaFindings(
      unit({
        sourceText: "Hello",
        translations: [{ locale: "fr", text: "Bonjour {name" }],
      }),
      baseOptions,
    );

    expect(findings.some((finding) => finding.checkType === "invalid_icu_structure")).toBe(true);
  });

  it("reports missing_translation", () => {
    const findings = collectUnitQaFindings(
      unit({
        sourceText: "Hello",
        translations: [],
      }),
      baseOptions,
    );

    expect(findings.some((finding) => finding.checkType === "missing_translation")).toBe(true);
  });

  it("reports stale_unchanged_target", () => {
    const findings = collectUnitQaFindings(
      unit({
        sourceText: "Updated source",
        translations: [{ locale: "fr", text: "Old target" }],
        providerPayload: {
          previousSourceText: "Old source",
          previousTargetText: "Old target",
        },
      }),
      baseOptions,
    );

    expect(findings.some((finding) => finding.checkType === "stale_unchanged_target")).toBe(true);
  });

  it("reports length_expansion", () => {
    const findings = collectUnitQaFindings(
      unit({
        sourceText: "Hi",
        translations: [{ locale: "fr", text: "Bonjour tout le monde" }],
      }),
      {
        ...baseOptions,
        lengthExpansionWarningRatio: 1.5,
      },
    );

    expect(findings.some((finding) => finding.checkType === "length_expansion")).toBe(true);
  });

  it("reports json_invalid", () => {
    const findings = collectUnitQaFindings(
      unit({
        sourceText: '{"enabled": true}',
        translations: [{ locale: "fr", text: '{"enabled":' }],
      }),
      baseOptions,
    );

    expect(findings.some((finding) => finding.checkType === "json_invalid")).toBe(true);
  });

  it("reports markdown_link issues", () => {
    const findings = collectUnitQaFindings(
      unit({
        sourceText: "Read [docs](https://example.com/docs)",
        translations: [{ locale: "fr", text: "Lisez [docs]()" }],
      }),
      baseOptions,
    );

    expect(findings.some((finding) => finding.checkType === "markdown_link")).toBe(true);
  });

  it("reports glossary_violation", () => {
    const findings = collectUnitQaFindings(
      unit({
        sourceText: "Save your changes",
        translations: [{ locale: "fr", text: "Sauvegardez vos modifications" }],
      }),
      {
        ...baseOptions,
        glossaryTerms: [
          {
            sourceTerm: "Save",
            targetTerm: "Enregistrer",
            forbidden: false,
            caseSensitive: false,
          },
        ],
      },
    );

    expect(findings.some((finding) => finding.checkType === "glossary_violation")).toBe(true);
  });
});

describe("runProviderJobQa", () => {
  it("returns normalized findings with summary", () => {
    const report = runProviderJobQa(
      {
        externalJobId: "job-1",
        targetLocales: ["fr"],
        units: [
          unit({ sourceText: "Hello {name}", translations: [{ locale: "fr", text: "Bonjour" }] }),
        ],
      },
      baseOptions,
    );

    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.findings[0]).toMatchObject({
      severity: expect.any(String),
      message: expect.any(String),
      item: expect.objectContaining({ key: "greeting" }),
    });
  });
});

describe("invariant helpers", () => {
  it("compares placeholder and ICU sets", () => {
    expect(samePlaceholderSet(["a", "b"], ["a", "b"])).toBe(true);
    expect(
      sameIcuBlocks(
        [{ arg: "n", type: "plural", options: ["one", "other"] }],
        [{ arg: "n", type: "plural", options: ["one", "other"] }],
      ),
    ).toBe(true);
  });
});
