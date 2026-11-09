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
import { describe, expect, it, vi } from "vite-plus/test";

import {
  checkTranslation,
  formatProblems,
  glossaryProblems,
  isUntranslatedCopy,
  withRetryFeedback,
  type ValidateSegment,
} from "./accept-translations";

const workspaceTerm = {
  sourceTerm: "Workspace",
  targetTerm: "Arbeitsbereich",
  targetLocale: "de-DE",
  forbidden: false,
};

function validatorReturning(checks: unknown[]) {
  return vi.fn<ValidateSegment>(async () => ({ checks }));
}

const placeholderFailure = {
  id: "format-missing-token",
  status: "fail",
  message:
    'translation invariant violation: placeholder parity mismatch (expected ["name"], got []) | source="Hi {name}" candidate="Hallo"',
};

describe("glossaryProblems", () => {
  it("asks for a missing preferred term and against a forbidden one", () => {
    expect(
      glossaryProblems({
        sourceText: "Open the workspace",
        translatedText: "Den Bereich öffnen",
        terms: [workspaceTerm, { ...workspaceTerm, targetTerm: "Bereich", forbidden: true }],
      }),
    ).toEqual(['Use "Arbeitsbereich" for "Workspace".', 'Do not use "Bereich" for "Workspace".']);
  });

  it("finds nothing when the term is kept", () => {
    expect(
      glossaryProblems({
        sourceText: "Open the workspace",
        translatedText: "Den Arbeitsbereich öffnen",
        terms: [workspaceTerm],
      }),
    ).toEqual([]);
  });
});

describe("formatProblems", () => {
  it("asks go-svc for its format checks only, with the file's settings", async () => {
    const validate = validatorReturning([]);
    await formatProblems(
      {
        sourceText: "Hi {name}",
        translatedText: "Hallo {name}",
        targetLocale: "de-DE",
        sourcePath: "en.json",
        messageFormat: "icu",
        placeholderPatterns: ["%s"],
      },
      validate,
    );
    expect(validate).toHaveBeenCalledWith({
      sourceText: "Hi {name}",
      targetText: "Hallo {name}",
      sourcePath: "en.json",
      targetLocale: "de-DE",
      messageFormat: "icu",
      placeholderPatterns: ["%s"],
      modes: [],
      acceptedWords: [],
    });
  });

  it("keeps failures without the quoted texts and drops warnings and passes", async () => {
    const problems = await formatProblems(
      { sourceText: "Hi {name}", translatedText: "Hallo", targetLocale: "de-DE" },
      validatorReturning([
        placeholderFailure,
        { ...placeholderFailure, status: "warn" },
        { id: "format", status: "pass", message: "ok" },
      ]),
    );
    expect(problems).toEqual([
      'translation invariant violation: placeholder parity mismatch (expected ["name"], got [])',
    ]);
  });

  it("skips the check when go-svc can't be reached", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const problems = await formatProblems(
      { sourceText: "Hi {name}", translatedText: "Hallo", targetLocale: "de-DE" },
      vi.fn<ValidateSegment>(async () => {
        throw new Error("go-svc unavailable");
      }),
    );
    expect(problems).toEqual([]);
    warn.mockRestore();
  });
});

describe("checkTranslation", () => {
  const base = {
    sourceText: "Open the workspace {name}",
    sourceLocale: "en-US",
    targetLocale: "de-DE",
    glossaryTerms: [
      workspaceTerm,
      { ...workspaceTerm, targetLocale: "fr-FR", targetTerm: "Espace" },
    ],
  };

  it("rejects a multi-word copy of the source without a go-svc call", async () => {
    const validate = validatorReturning([]);
    const check = await checkTranslation(
      { ...base, translatedText: "Open the workspace {name}" },
      validate,
    );
    expect(check).toEqual({
      ok: false,
      problems: [
        "The translation is a copy of the source text. Translate it into the target language.",
      ],
      copy: true,
      blocking: true,
    });
    expect(validate).not.toHaveBeenCalled();
  });

  it("accepts a one-word copy, such as a brand name", async () => {
    const check = await checkTranslation(
      { ...base, sourceText: "Lumora", translatedText: "Lumora", glossaryTerms: [] },
      validatorReturning([]),
    );
    expect(check).toEqual({ ok: true });
  });

  it("collects glossary problems for its own language and format errors, for a retry", async () => {
    const check = await checkTranslation(
      { ...base, translatedText: "Den Bereich öffnen" },
      validatorReturning([placeholderFailure]),
    );
    expect(check).toEqual({
      ok: false,
      problems: [
        'Use "Arbeitsbereich" for "Workspace".',
        'translation invariant violation: placeholder parity mismatch (expected ["name"], got [])',
      ],
      copy: false,
      blocking: true,
    });
  });

  it("marks a glossary problem alone as not blocking", async () => {
    const check = await checkTranslation(
      { ...base, translatedText: "Den Bereich {name} öffnen" },
      validatorReturning([]),
    );
    expect(check).toEqual({
      ok: false,
      problems: ['Use "Arbeitsbereich" for "Workspace".'],
      copy: false,
      blocking: false,
    });
  });

  it("accepts a clean translation", async () => {
    const check = await checkTranslation(
      { ...base, translatedText: "Den Arbeitsbereich {name} öffnen" },
      validatorReturning([]),
    );
    expect(check).toEqual({ ok: true });
  });
});

describe("isUntranslatedCopy", () => {
  const copy = (sourceText: string, targetLocale = "de-DE") =>
    isUntranslatedCopy({
      sourceText,
      translatedText: ` ${sourceText} `,
      sourceLocale: "en-US",
      targetLocale,
    });

  it("finds a copy of two or more words", () => {
    expect(copy("Open the workspace")).toBe(true);
    expect(copy("{{count}} requests left today")).toBe(true);
  });

  it("allows one-word and placeholder-only copies", () => {
    expect(copy("Lumora")).toBe(false);
    expect(copy("Hello {name}")).toBe(false);
    expect(copy("{first} {last}")).toBe(false);
    expect(copy("%1$s / %2$s")).toBe(false);
  });

  it("allows a copy in the source's own language", () => {
    expect(copy("Open the workspace", "en-GB")).toBe(false);
  });

  it("is not a copy when the text differs", () => {
    expect(
      isUntranslatedCopy({
        sourceText: "Open the workspace",
        translatedText: "Arbeitsbereich öffnen",
        sourceLocale: "en-US",
        targetLocale: "de-DE",
      }),
    ).toBe(false);
  });
});

describe("withRetryFeedback", () => {
  it("adds each language's problems after the string description", () => {
    expect(
      withRetryFeedback(
        "Button label.",
        new Map([
          ["de-DE", ['Use "Arbeitsbereich" for "Workspace".']],
          ["fr-FR", ["Placeholder {name} is missing."]],
        ]),
      ),
    ).toBe(
      [
        "Button label.",
        "Your previous translation was rejected. Translate again and fix these problems:",
        '- de-DE: Use "Arbeitsbereich" for "Workspace".',
        "- fr-FR: Placeholder {name} is missing.",
      ].join("\n"),
    );
  });

  it("works without a description", () => {
    expect(withRetryFeedback(undefined, new Map([["de-DE", ["Problem."]]]))).toBe(
      "Your previous translation was rejected. Translate again and fix these problems:\n- de-DE: Problem.",
    );
  });
});
