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
/**
 * The checks a fresh machine translation of a chosen string passes before a key job saves it:
 * not an untranslated copy of the source, glossary terms kept, and the string file's format and
 * placeholders intact. Problems are phrased for the model, which gets one retry to fix them.
 */
import {
  validateGlossaryTermsInTranslation,
  type GlossaryTermConstraint,
} from "@/lib/glossary/validate-glossary-terms-in-translation";
import { createGoSvcServerClient } from "@/lib/go-svc/go-svc-server-client";
import type { ValidateSegmentBody } from "@/lib/go-svc/go-svc-client.types";
import type { MessageFormat } from "@/lib/i18n/message-format";

const FORMAT_CHECK_TIMEOUT_MS = 10_000;

/** Placeholders left out when counting a source's words: {name}, {{name}}, %s, %1$d and tags. */
const PLACEHOLDER_PATTERN =
  /\{\{[^{}]*\}\}|\{[^{}]*\}|%(?:\d+\$)?[-+ #0]*\d*(?:\.\d+)?[a-zA-Z@]|<[^<>]+>/g;

function baseLanguage(locale: string) {
  return locale.split(/[-_]/)[0]!.toLowerCase();
}

/**
 * Whether a translation just repeats its source, as the model does when it can't translate a
 * string. Like the file job's rule (#1843) it needs two or more words, as one-word copies such as
 * brand names are often meant; words are counted outside placeholders, so `{first} {last}` can be
 * copied, and a target in the source's language (en-US to en-GB) may match it word for word.
 */
export function isUntranslatedCopy(input: {
  sourceText: string;
  translatedText: string;
  sourceLocale: string;
  targetLocale: string;
}) {
  const source = input.sourceText.trim();
  if (!source || source !== input.translatedText.trim()) return false;
  if (baseLanguage(input.sourceLocale) === baseLanguage(input.targetLocale)) return false;
  const words = source
    .replace(PLACEHOLDER_PATTERN, " ")
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word));
  return words.length >= 2;
}

export type ValidateSegment = (body: ValidateSegmentBody) => Promise<{ checks: unknown[] }>;

/**
 * go-svc's format and placeholder checks alone (no optional modes). Not `validateScanSegment`,
 * whose in-app placeholder check reads one-word ICU options such as `other {Settings}` as
 * placeholders and would reject correct translations.
 */
const validateWithGoSvc: ValidateSegment = (body) =>
  createGoSvcServerClient().qaReport.validateSegment(body, {
    signal: AbortSignal.timeout(FORMAT_CHECK_TIMEOUT_MS),
  });

function failedCheckMessage(check: unknown) {
  if (typeof check !== "object" || check === null) return null;
  const { status, message } = check as { status?: unknown; message?: unknown };
  if (status !== "fail" || typeof message !== "string") return null;
  // go-svc appends the source and candidate text after " | "; the model already has both.
  return message.split(" | ")[0]!.trim();
}

export type TranslationFileSettings = {
  sourcePath?: string | null;
  messageFormat?: MessageFormat | null;
  placeholderPatterns?: readonly string[] | null;
};

/** Glossary rules the translation breaks, phrased as instructions for a retry. */
export function glossaryProblems(input: {
  sourceText: string;
  translatedText: string;
  terms: readonly GlossaryTermConstraint[];
}): string[] {
  return validateGlossaryTermsInTranslation({ ...input, terms: [...input.terms] }).map((failure) =>
    failure.forbidden
      ? `Do not use "${failure.targetTerm}" for "${failure.sourceTerm}".`
      : `Use "${failure.targetTerm}" for "${failure.sourceTerm}".`,
  );
}

/**
 * Format and placeholder errors from go-svc, with the string's own file settings. When go-svc
 * can't be reached the check is skipped: the translation is saved for review anyway, so an
 * outage doesn't fail every string.
 */
export async function formatProblems(
  input: TranslationFileSettings & {
    sourceText: string;
    translatedText: string;
    targetLocale: string;
  },
  validate: ValidateSegment = validateWithGoSvc,
): Promise<string[]> {
  try {
    const { checks } = await validate({
      sourceText: input.sourceText,
      targetText: input.translatedText,
      sourcePath: input.sourcePath ?? "",
      targetLocale: input.targetLocale,
      ...(input.messageFormat ? { messageFormat: input.messageFormat } : {}),
      ...(input.placeholderPatterns?.length
        ? { placeholderPatterns: [...input.placeholderPatterns] }
        : {}),
      modes: [],
      acceptedWords: [],
    });
    return checks.flatMap((check) => failedCheckMessage(check) ?? []);
  } catch (error) {
    console.warn("[accept-translations] go-svc format check failed; skipping it", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return [];
  }
}

export type TranslationCheck =
  | { ok: true }
  | {
      ok: false;
      problems: string[];
      /** Whether the answer just repeats the source. */
      copy: boolean;
      /**
       * False when only glossary terms are off. Such an answer is saved for review after the
       * retry, as a correctly inflected term reads as missing to the glossary check.
       */
      blocking: boolean;
    };

/** Runs every accept check on one fresh translation. */
export async function checkTranslation(
  input: TranslationFileSettings & {
    sourceText: string;
    translatedText: string;
    sourceLocale: string;
    targetLocale: string;
    glossaryTerms: readonly GlossaryTermConstraint[];
  },
  validate: ValidateSegment = validateWithGoSvc,
): Promise<TranslationCheck> {
  if (isUntranslatedCopy(input)) {
    return {
      ok: false,
      problems: [
        "The translation is a copy of the source text. Translate it into the target language.",
      ],
      copy: true,
      blocking: true,
    };
  }
  const glossary = glossaryProblems({
    sourceText: input.sourceText,
    translatedText: input.translatedText,
    terms: input.glossaryTerms.filter((term) => term.targetLocale === input.targetLocale),
  });
  const format = await formatProblems(input, validate);
  if (glossary.length === 0 && format.length === 0) return { ok: true };
  return {
    ok: false,
    problems: [...glossary, ...format],
    copy: false,
    blocking: format.length > 0,
  };
}

/** The string description with the rejected answer's problems added, for one retry. */
export function withRetryFeedback(
  context: string | undefined,
  problemsByLocale: ReadonlyMap<string, readonly string[]>,
): string {
  const lines = [...problemsByLocale].flatMap(([locale, problems]) =>
    problems.map((problem) => `- ${locale}: ${problem}`),
  );
  return [
    context?.trim() ?? "",
    "Your previous translation was rejected. Translate again and fix these problems:",
    ...lines,
  ]
    .filter(Boolean)
    .join("\n");
}
