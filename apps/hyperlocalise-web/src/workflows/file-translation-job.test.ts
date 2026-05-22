import { describe, expect, it } from "vite-plus/test";

import { validateGlossaryTermsInTranslation } from "./file-translation-job";

describe("validateGlossaryTermsInTranslation", () => {
  it("includes approved preferred terms only when source term appears", () => {
    const failures = validateGlossaryTermsInTranslation({
      sourceText: "Welcome to Hyperlocalise.",
      translatedText: "Bienvenue.",
      terms: [
        {
          sourceTerm: "Hyperlocalise",
          targetTerm: "Hyperlocalise",
          targetLocale: "fr-FR",
          forbidden: false,
        },
      ],
    });

    expect(failures).toEqual([
      {
        sourceTerm: "Hyperlocalise",
        targetTerm: "Hyperlocalise",
        forbidden: false,
        reason: "missing_preferred_term",
      },
    ]);
  });

  it("flags forbidden target terms", () => {
    const failures = validateGlossaryTermsInTranslation({
      sourceText: "Click the workspace settings.",
      translatedText: "Cliquez sur les paramètres de workspace.",
      terms: [
        {
          sourceTerm: "workspace",
          targetTerm: "workspace",
          targetLocale: "fr-FR",
          forbidden: true,
        },
      ],
    });

    expect(failures).toEqual([
      {
        sourceTerm: "workspace",
        targetTerm: "workspace",
        forbidden: true,
        reason: "contains_forbidden_term",
      },
    ]);
  });

  it("ignores terms with no configured constraint", () => {
    const failures = validateGlossaryTermsInTranslation({
      sourceText: "Click the workspace settings.",
      translatedText: "Cliquez sur les paramètres.",
      terms: [
        {
          sourceTerm: "workspace",
          targetTerm: "espace de travail",
          targetLocale: "fr-FR",
          forbidden: null,
        },
      ],
    });

    expect(failures).toEqual([]);
  });

  it("respects case-sensitive glossary matching", () => {
    const failures = validateGlossaryTermsInTranslation({
      sourceText: "Use API credentials.",
      translatedText: "Utilisez api credentials.",
      terms: [
        {
          sourceTerm: "API",
          targetTerm: "API",
          targetLocale: "fr-FR",
          forbidden: false,
          caseSensitive: true,
        },
      ],
    });

    expect(failures).toEqual([
      {
        sourceTerm: "API",
        targetTerm: "API",
        forbidden: false,
        reason: "missing_preferred_term",
      },
    ]);
  });
});
