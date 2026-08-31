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
import * as XLSX from "xlsx";
import { describe, expect, it } from "vite-plus/test";

import { parseXlsx, serializeXlsx } from "./xlsx";
import type { GlossaryInterchangeDocument } from "./glossary-interchange";

const document: GlossaryInterchangeDocument = {
  glossary: {
    id: "glossary-1",
    name: "Unicode glossary",
    description: "",
    sourceLocale: "en-US",
    source: "native",
    termCapabilities: {},
  },
  concepts: [
    {
      id: "concept-1",
      primaryTerm: "café",
      subject: "Food",
      definition: "A café.",
      translatable: true,
      note: "",
      url: null,
      figure: null,
      languageDetails: [],
      metadata: { "provider:domain": "food" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      terms: [
        {
          id: "term-1",
          conceptId: "concept-1",
          locale: "en-US",
          term: "café",
          description: "",
          note: "",
          partOfSpeech: "noun",
          gender: null,
          termType: "full form",
          url: null,
          lemma: "café",
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
          locale: "en-US",
          term: "coffee shop",
          description: "",
          note: "",
          partOfSpeech: "noun",
          gender: null,
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

describe("XLSX glossary interchange", () => {
  it("round-trips concepts, synonyms, IDs, Unicode, and metadata", () => {
    const serialized = serializeXlsx(document);
    expect(serialized.errors).toEqual([]);
    const workbook = XLSX.read(serialized.content, { type: "array" });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.Concepts, { header: 1 })[0]).not.toContain(
      "externalKey",
    );
    const parsed = parseXlsx(serialized.content);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.concepts).toHaveLength(1);
    expect(parsed.concepts[0]?.id).toBe("concept-1");
    expect(parsed.concepts[0]?.metadata).toEqual({ "provider:domain": "food" });
    expect(parsed.concepts[0]?.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(parsed.concepts[0]?.terms.map((term) => term.term)).toEqual(["café", "coffee shop"]);
    expect(parsed.concepts[0]?.terms[0]?.caseSensitive).toBe(true);
    expect(parsed.concepts[0]?.terms[0]?.metadata).toEqual({ "provider:stable": "term-1" });
  });

  it("reports malformed workbooks, missing IDs, and orphan rows", () => {
    const parsed = parseXlsx(Uint8Array.from(Buffer.from("not an xlsx")));
    expect(
      parsed.diagnostics.some(
        (entry) => entry.code === "malformed_workbook" || entry.code === "missing_workbook_sheet",
      ),
    ).toBe(true);
  });

  it("keeps omitted fields undefined for merge semantics", () => {
    const workbook = XLSX.utils.book_new();
    const concepts = XLSX.utils.json_to_sheet([{ conceptId: "concept-1" }], {
      header: ["conceptId"],
    });
    const terms = XLSX.utils.json_to_sheet(
      [{ termId: "term-1", conceptId: "concept-1", locale: "en-US", term: "Checkout" }],
      { header: ["termId", "conceptId", "locale", "term"] },
    );
    XLSX.utils.book_append_sheet(workbook, concepts, "Concepts");
    XLSX.utils.book_append_sheet(workbook, terms, "Terms");

    const parsed = parseXlsx(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.concepts[0]?.primaryTerm).toBeUndefined();
    expect(parsed.concepts[0]?.terms[0]?.createdAt).toBeUndefined();
    expect(parsed.concepts[0]?.terms[0]?.updatedAt).toBeUndefined();
    expect(parsed.concepts[0]?.terms[0]?.caseSensitive).toBeUndefined();
  });
});
