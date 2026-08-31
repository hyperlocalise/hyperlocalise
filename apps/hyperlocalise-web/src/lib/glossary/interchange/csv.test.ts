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
      externalKey: "external-1",
      externalUserId: null,
      externalCreatedAt: null,
      externalUpdatedAt: null,
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

    const parsed = parseCsv(csv);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.concepts).toHaveLength(1);
    expect(parsed.concepts[0]?.id).toBe("concept-1");
    expect(parsed.concepts[0]?.metadata).toEqual({ "provider:domain": "pets" });
    expect(parsed.concepts[0]?.terms.map((term) => term.term)).toEqual(["cat, house", "chat"]);
    expect(parsed.concepts[0]?.terms[0]?.metadata).toEqual({ "provider:stable": "term-1" });
    expect(parsed.concepts[0]?.terms[0]?.caseSensitive).toBe(true);
  });
});
