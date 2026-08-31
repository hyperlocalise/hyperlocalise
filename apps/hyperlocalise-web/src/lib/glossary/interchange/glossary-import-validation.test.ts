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

import { validateGlossaryImportDocument } from "./glossary-import-validation";
import type { GlossaryImportDocument } from "./glossary-interchange";

function makeDocument(
  concepts: GlossaryImportDocument["concepts"],
  diagnostics: GlossaryImportDocument["diagnostics"] = [],
): GlossaryImportDocument {
  return { concepts, diagnostics };
}

describe("glossary import validation", () => {
  it("skips unknown-locale terms while preserving valid terms", () => {
    const result = validateGlossaryImportDocument(
      makeDocument([
        {
          id: "concept-1",
          primaryTerm: "Checkout",
          terms: [
            { id: "term-en", locale: "en", term: "Checkout" },
            { id: "term-de", locale: "de", term: "Kasse" },
          ],
        },
      ]),
      { sourceLocale: "en", knownLocales: new Set(["en", "fr"]), strictLocale: true },
    );

    expect(result.document.concepts[0]?.terms).toEqual([
      { id: "term-en", locale: "en", term: "Checkout" },
    ]);
    expect(result.document.diagnostics).toEqual([
      expect.objectContaining({
        code: "unknown_locale",
        conceptId: "concept-1",
        termId: "term-de",
        outcome: "skipped",
      }),
    ]);
    expect(result.hasFileFatalError).toBe(false);
  });

  it("skips concepts that have no source-locale term", () => {
    const result = validateGlossaryImportDocument(
      makeDocument([
        {
          id: "concept-1",
          primaryTerm: "Kasse",
          terms: [{ id: "term-fr", locale: "fr", term: "Caisse" }],
        },
      ]),
      { sourceLocale: "en", knownLocales: new Set(["en", "fr"]), strictLocale: true },
    );

    expect(result.document.concepts).toEqual([]);
    expect(result.document.diagnostics).toEqual([
      expect.objectContaining({
        code: "missing_source_locale",
        conceptId: "concept-1",
        outcome: "skipped",
      }),
    ]);
  });

  it("removes invalid timestamp records and identifies file-fatal errors", () => {
    const result = validateGlossaryImportDocument(
      makeDocument(
        [
          {
            id: "concept-1",
            terms: [
              {
                id: "term-en",
                locale: "en",
                term: "Checkout",
                createdAt: "not-a-date",
              },
            ],
          },
        ],
        [{ severity: "error", code: "invalid_xml", message: "The document is not XML." }],
      ),
      { sourceLocale: "en", knownLocales: new Set(["en"]), strictLocale: true },
    );

    expect(result.document.concepts).toEqual([]);
    expect(result.hasFileFatalError).toBe(true);
    expect(result.document.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_xml" }),
        expect.objectContaining({ code: "invalid_timestamp", termId: "term-en" }),
      ]),
    );
  });
});
