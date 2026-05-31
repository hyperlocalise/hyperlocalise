import { describe, expect, it } from "vite-plus/test";
import { collectSupplementalQaFindings } from "./supplemental-checks";
import type { ExternalTmsTranslationUnit } from "@/lib/providers/sync/external-tms-content-sync";

function unit(overrides: Partial<ExternalTmsTranslationUnit> = {}): ExternalTmsTranslationUnit {
  return {
    externalStringId: "1",
    key: "test",
    sourceText: "source",
    translations: [],
    ...overrides,
  };
}

const baseOptions = {
  targetLocales: ["fr"],
  sourceLocale: "en",
};

describe("supplemental-checks glossary matching", () => {
  it("should match basic word terms", () => {
    const findings = collectSupplementalQaFindings(
      unit({
        sourceText: "Save your work",
        translations: [{ locale: "fr", text: "Sauvegarder" }],
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

    expect(findings.some((f) => f.checkType === "glossary_violation")).toBe(true);
  });

  it("should match terms with non-word characters at the end (e.g., C#)", () => {
    const findings = collectSupplementalQaFindings(
      unit({
        sourceText: "Learning C# today",
        translations: [{ locale: "fr", text: "Apprendre C#" }],
      }),
      {
        ...baseOptions,
        glossaryTerms: [
          {
            sourceTerm: "C#",
            targetTerm: "C# (langage)",
            forbidden: false,
            caseSensitive: false,
          },
        ],
      },
    );

    expect(findings.some((f) => f.checkType === "glossary_violation")).toBe(true);
  });

  it("should match terms with non-word characters at the start (e.g., .NET)", () => {
    const findings = collectSupplementalQaFindings(
      unit({
        sourceText: "Using .NET framework",
        translations: [{ locale: "fr", text: "Utilisation de .NET" }],
      }),
      {
        ...baseOptions,
        glossaryTerms: [
          {
            sourceTerm: ".NET",
            targetTerm: ".NET Framework",
            forbidden: false,
            caseSensitive: false,
          },
        ],
      },
    );

    expect(findings.some((f) => f.checkType === "glossary_violation")).toBe(true);
  });

  it("should match terms with punctuation (e.g., Go!)", () => {
    const findings = collectSupplementalQaFindings(
      unit({
        sourceText: "Let's Go!",
        translations: [{ locale: "fr", text: "Allons-y !" }],
      }),
      {
        ...baseOptions,
        glossaryTerms: [
          {
            sourceTerm: "Go!",
            targetTerm: "En avant !",
            forbidden: false,
            caseSensitive: false,
          },
        ],
      },
    );

    expect(findings.some((f) => f.checkType === "glossary_violation")).toBe(true);
  });

  it("should NOT match if the term is part of a larger word", () => {
    const findings = collectSupplementalQaFindings(
      unit({
        sourceText: "Scabbard",
        translations: [{ locale: "fr", text: "Fourreau" }],
      }),
      {
        ...baseOptions,
        glossaryTerms: [
          {
            sourceTerm: "cab",
            targetTerm: "taxi",
            forbidden: false,
            caseSensitive: false,
          },
        ],
      },
    );

    expect(findings.some((f) => f.checkType === "glossary_violation")).toBe(false);
  });
});
