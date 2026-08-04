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

/** Matches `maxContextSearchTerms` in lib/translation/concordance.ts. */
const MAX_NATIVE_GLOSSARY_SEARCH_TERMS = 50;

/**
 * Build a prefix-ready candidate tsquery from free-form user input.
 *
 * Strips characters that have special meaning in Postgres tsquery syntax
 * so that untrusted input cannot break the query. Matches
 * `buildGlossaryTsQuery` in lib/translation/concordance.ts (including quotes
 * and hyphens common in UI copy such as "What's new"). Terms are joined with
 * OR so glossary entries can match words within a longer source sentence.
 */
export function buildNativeGlossaryTsQuery(input: string): string {
  return input
    .replace(/[&|!():*<>'"-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_NATIVE_GLOSSARY_SEARCH_TERMS)
    .map((word) => `${word}:*`)
    .join(" | ");
}
