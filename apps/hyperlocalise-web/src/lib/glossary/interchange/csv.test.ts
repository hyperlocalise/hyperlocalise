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

import { parseCsv, serializeCsv } from "./csv";
import type { GlossaryInterchangeDocument } from "./glossary-interchange";

const document: GlossaryInterchangeDocument = {
  glossary: {
    id: "glossary-1",
    name: "CSV glossary",
    description: "",
    sourceLocale: "en-US",
    source: "native",
    termCapabilities: {},
  },
  concepts: [
    {
      id: "concept-1",
      primaryTerm: "cat, house",
      subject: "Animals",
      definition: "A friendly animal",
      translatable: true,
      note: "Concept note",
      url: "https://example.com/concept",
      figure: null,
      languageDetails: [],
      metadata: { "provider:domain": "pets" },
      terms: [
        {
          id: "term-1",
          conceptId: "concept-1",
          locale: "en-US",
          term: "cat, house",
          description: "A domestic animal",
          note: "Use in friendly contexts",
          partOfSpeech: "noun",
          gender: null,
          termType: "phrase",
          url: "https://example.com/term",
          lemma: "cat",
          status: "preferred",
          caseSensitive: true,
          forbidden: false,
          provenance: "manual",
          reviewStatus: "approved",
          metadata: { "provider:stable": "term-1" },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
        {
          id: "term-2",
          conceptId: "concept-1",
          locale: "fr-FR",
          term: "chat",
          description: "",
          note: "",
          partOfSpeech: "noun",
          gender: "masculine",
          termType: "variant",
          url: null,
          lemma: null,
          status: "admitted",
          caseSensitive: false,
          forbidden: false,
          provenance: "manual",
          reviewStatus: "approved",
          metadata: {},
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    },
  ],
};

describe("CSV glossary interchange", () => {
  it("round-trips concepts, synonyms, metadata, Unicode, and escaped cells", () => {
    const serialized = serializeCsv(document);
    expect(serialized.errors).toEqual([]);
    const csv = new TextDecoder().decode(serialized.content);
    expect(csv).toContain("conceptId");
    expect(csv).toContain('"cat, house"');
    expect(csv).not.toContain("externalKey");
    expect(csv).not.toContain("externalCreatedAt");

    const parsed = parseCsv(csv);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.concepts).toHaveLength(1);
    expect(parsed.concepts[0]?.id).toBe("concept-1");
    expect(parsed.concepts[0]?.metadata).toEqual({ "provider:domain": "pets" });
    expect(parsed.concepts[0]?.terms.map((term) => term.term)).toEqual(["cat, house", "chat"]);
    expect(parsed.concepts[0]?.terms[0]?.metadata).toEqual({ "provider:stable": "term-1" });
    expect(parsed.concepts[0]?.terms[0]?.caseSensitive).toBe(true);
  });

  it("keeps omitted fields undefined for merge semantics", () => {
    const parsed = parseCsv(
      ["conceptId,termId,locale,term", "concept-1,term-1,en-US,Checkout"].join("\n"),
    );

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.concepts[0]?.primaryTerm).toBeUndefined();
    expect(parsed.concepts[0]?.subject).toBeUndefined();
    expect(parsed.concepts[0]?.url).toBeUndefined();
    expect(parsed.concepts[0]?.figure).toBeUndefined();
    expect(parsed.concepts[0]?.terms[0]?.createdAt).toBeUndefined();
    expect(parsed.concepts[0]?.terms[0]?.updatedAt).toBeUndefined();
    expect(parsed.concepts[0]?.terms[0]?.status).toBeUndefined();
    expect(parsed.concepts[0]?.terms[0]?.gender).toBeUndefined();
    expect(parsed.concepts[0]?.terms[0]?.termType).toBeUndefined();
    expect(parsed.concepts[0]?.terms[0]?.url).toBeUndefined();
    expect(parsed.concepts[0]?.terms[0]?.lemma).toBeUndefined();
  });

  it("distinguishes explicit empty nullable fields and identifies row errors", () => {
    const parsed = parseCsv(
      [
        "conceptId,termId,locale,term,conceptUrl,figure,gender,termType,termUrl,lemma,caseSensitive",
        "concept-1,term-1,en-US,Checkout,,,,,,,maybe",
      ].join("\n"),
    );

    expect(parsed.concepts[0]?.url).toBe(null);
    expect(parsed.concepts[0]?.figure).toBe(null);
    expect(parsed.concepts[0]?.terms[0]?.gender).toBe(null);
    expect(parsed.concepts[0]?.terms[0]?.termType).toBe(null);
    expect(parsed.concepts[0]?.terms[0]?.url).toBe(null);
    expect(parsed.concepts[0]?.terms[0]?.lemma).toBe(null);
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        code: "invalid_boolean",
        conceptId: "concept-1",
        termId: "term-1",
        sourceRow: 2,
      }),
    ]);
  });

  it("escapes spreadsheet formulas while preserving them on import", () => {
    const formulaDocument = {
      ...document,
      concepts: [
        {
          ...document.concepts[0]!,
          terms: [
            {
              ...document.concepts[0]!.terms[0]!,
              term: " =SUM(A1:A2)",
            },
            {
              ...document.concepts[0]!.terms[1]!,
              id: "term-3",
              term: "+provider-command",
            },
            {
              ...document.concepts[0]!.terms[1]!,
              id: "term-4",
              term: "-provider-command",
            },
            {
              ...document.concepts[0]!.terms[1]!,
              id: "term-5",
              term: "@provider-command",
            },
            {
              ...document.concepts[0]!.terms[1]!,
              id: "term-6",
              term: "'=SUM(A1:A2)",
            },
          ],
        },
      ],
    } satisfies GlossaryInterchangeDocument;
    const csv = new TextDecoder().decode(serializeCsv(formulaDocument).content);
    expect(csv).toContain(`"__HYPERLOCALISE_CSV_FORMULA__ =SUM(A1:A2)"`);
    expect(csv).toContain(`"__HYPERLOCALISE_CSV_FORMULA__+provider-command"`);
    expect(csv).toContain(`"__HYPERLOCALISE_CSV_FORMULA__-provider-command"`);
    expect(csv).toContain(`"__HYPERLOCALISE_CSV_FORMULA__@provider-command"`);
    expect(csv).toContain(`"'=SUM(A1:A2)"`);
    expect(parseCsv(csv).concepts[0]?.terms.map((term) => term.term)).toEqual([
      " =SUM(A1:A2)",
      "+provider-command",
      "-provider-command",
      "@provider-command",
      "'=SUM(A1:A2)",
    ]);
  });

  it("derives legacy term IDs independently of row order", () => {
    const first = parseCsv(
      ["conceptId,locale,term", "concept-1,en,Alpha", "concept-1,en,Beta"].join("\n"),
    );
    const reordered = parseCsv(
      ["conceptId,locale,term", "concept-1,en,Beta", "concept-1,en,Alpha"].join("\n"),
    );

    expect(first.diagnostics).toEqual([]);
    expect(reordered.diagnostics).toEqual([]);
    expect(new Map(first.concepts[0]!.terms.map((term) => [term.term, term.id]))).toEqual(
      new Map(reordered.concepts[0]!.terms.map((term) => [term.term, term.id])),
    );
  });

  it("rejects term IDs reused across concepts", () => {
    const parsed = parseCsv(
      [
        "conceptId,termId,locale,term",
        "concept-1,term-1,en,Alpha",
        "concept-2,term-1,en,Beta",
      ].join("\n"),
    );

    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        code: "duplicate_term_id",
        conceptId: "concept-2",
        termId: "term-1",
        sourceRow: 3,
      }),
    ]);
    expect(parsed.concepts).toHaveLength(1);
    expect(parsed.concepts[0]?.id).toBe("concept-1");
  });
});
