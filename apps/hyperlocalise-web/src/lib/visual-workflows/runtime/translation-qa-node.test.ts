/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { evaluateInlineTranslationQa } from "./localization-actions";

const base = {
  projectId: "project_1",
  source: "Hello {name}",
  translation: "Bonjour {name}",
  sourceLocale: "en-AU",
  targetLocale: "fr-FR",
};

describe("inline Translation QA workflow node", () => {
  it("returns a stable passing result without exposing source or translation", () => {
    const first = evaluateInlineTranslationQa(base);
    const replay = evaluateInlineTranslationQa(base);

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      ok: true,
      output: {
        passed: true,
        errorCount: 0,
        findingCount: 0,
        findings: [],
        deterministicFindingCount: 0,
        modelFindingCount: 0,
        findingsTruncated: false,
      },
    });
    expect(JSON.stringify(first)).not.toContain(base.source);
    expect(JSON.stringify(first)).not.toContain(base.translation);
  });

  it("reports deterministic placeholder and glossary findings with corrections", () => {
    const result = evaluateInlineTranslationQa({
      ...base,
      translation: "Salut",
      glossaryReferences: [{ sourceTerm: "Hello", targetTerm: "Bonjour" }],
      selectedChecks: ["placeholder_mismatch", "glossary_violation"],
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        passed: false,
        errorCount: 1,
        warningCount: 1,
        findingCount: 2,
        deterministicFindingCount: 2,
        findings: [
          { checkType: "placeholder_mismatch", severity: "error", origin: "deterministic" },
          { checkType: "glossary_violation", severity: "warning", origin: "deterministic" },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain("Hello");
    expect(JSON.stringify(result)).not.toContain("Bonjour");
  });

  it("runs only selected checks and distinguishes requested model checks", () => {
    const result = evaluateInlineTranslationQa({
      ...base,
      translation: "Hello {name}",
      selectedChecks: ["placeholder_mismatch", "guideline"],
      translationMemoryReferences: Array.from({ length: 120 }, () => ({})),
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        findingCount: 0,
        modelChecksSkipped: true,
      },
    });
  });

  it("applies bounded project policy inputs", () => {
    const result = evaluateInlineTranslationQa({
      ...base,
      projectPolicies: { maxLength: 5 },
      selectedChecks: ["length"],
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        passed: false,
        findings: [{ checkType: "length", severity: "error" }],
      },
    });
  });
});
