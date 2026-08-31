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
import { diagnostic, type GlossaryImportDocument } from "./glossary-interchange";

const fileFatalImportDiagnosticCodes = new Set([
  "file_too_large",
  "entry_limit_exceeded",
  "invalid_xml",
  "unsupported_tbx_namespace",
  "unsupported_tbx_profile",
  "malformed_workbook",
  "missing_workbook_sheet",
]);

export function validateGlossaryImportDocument(
  document: GlossaryImportDocument,
  options: { sourceLocale: string; knownLocales: Set<string>; strictLocale: boolean },
) {
  const diagnostics = document.diagnostics;
  for (const concept of document.concepts) {
    if (
      options.strictLocale &&
      !concept.terms.some((term) => term.locale === options.sourceLocale)
    ) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          outcome: "skipped",
          code: "missing_source_locale",
          message: "Concept has no term in the glossary source locale.",
          conceptId: concept.id,
          field: "sourceLocale",
        }),
      );
    }
    for (const [field, value] of [
      ["createdAt", concept.createdAt],
      ["updatedAt", concept.updatedAt],
    ] as const) {
      if (value && Number.isNaN(new Date(value).valueOf())) {
        diagnostics.push(
          diagnostic({
            severity: "error",
            outcome: "skipped",
            code: "invalid_timestamp",
            message: "Timestamp must be a valid ISO-8601 date.",
            conceptId: concept.id,
            field,
          }),
        );
      }
    }
    for (const term of concept.terms) {
      if (options.strictLocale && !options.knownLocales.has(term.locale)) {
        diagnostics.push(
          diagnostic({
            severity: "error",
            outcome: "skipped",
            code: "unknown_locale",
            message: "Term locale is not configured for this glossary.",
            conceptId: concept.id,
            termId: term.id,
            field: "locale",
          }),
        );
      }
      for (const [field, value] of [
        ["createdAt", term.createdAt],
        ["updatedAt", term.updatedAt],
      ] as const) {
        if (value && Number.isNaN(new Date(value).valueOf())) {
          diagnostics.push(
            diagnostic({
              severity: "error",
              outcome: "skipped",
              code: "invalid_timestamp",
              message: "Timestamp must be a valid ISO-8601 date.",
              conceptId: concept.id,
              termId: term.id,
              field,
            }),
          );
        }
      }
    }
  }
  const termErrorKeys = new Set(
    diagnostics
      .filter((entry) => entry.severity === "error" && entry.conceptId && entry.termId)
      .map((entry) => `${entry.conceptId}\u0000${entry.termId}`),
  );
  const conceptBlockingIds = new Set(
    diagnostics
      .filter((entry) => entry.severity === "error" && entry.conceptId && !entry.termId)
      .map((entry) => entry.conceptId),
  );
  const concepts = document.concepts.flatMap((concept) => {
    if (conceptBlockingIds.has(concept.id)) return [];
    const terms = concept.terms.filter(
      (term) => !termErrorKeys.has(`${concept.id}\u0000${term.id}`),
    );
    if (terms.length === 0) {
      if (concept.terms.length > 0) {
        diagnostics.push(
          diagnostic({
            outcome: "skipped",
            conceptId: concept.id,
            code: "concept_has_no_valid_terms",
            message: "Concept has no valid terms and was not imported.",
          }),
        );
      }
      return [];
    }
    return [{ ...concept, terms }];
  });
  const hasFileFatalError = diagnostics.some(
    (entry) => entry.severity === "error" && fileFatalImportDiagnosticCodes.has(entry.code),
  );
  return {
    document: { concepts, diagnostics },
    hasFileFatalError,
    hasErrors: diagnostics.some((entry) => entry.severity === "error"),
  } satisfies {
    document: GlossaryImportDocument;
    hasFileFatalError: boolean;
    hasErrors: boolean;
  };
}
