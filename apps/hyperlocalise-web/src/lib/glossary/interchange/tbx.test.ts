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
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { TBX_NAMESPACE, parseTbx, serializeTbx } from "./tbx";
import type { GlossaryInterchangeDocument } from "./glossary-interchange";

const glossary = {
  id: "glossary-1",
  name: "Product <Terms>",
  description: "Multilingual terminology",
  sourceLocale: "en-US",
  source: "native" as const,
  termCapabilities: {},
};

function makeDocument(): GlossaryInterchangeDocument {
  return {
    glossary,
    concepts: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        primaryTerm: "cat",
        subject: "Animals & pets",
        definition: "A <small>domesticated</small> animal.",
        translatable: true,
        note: "Keep <angle brackets> escaped.",
        url: "https://example.com/concept",
        figure: "https://example.com/cat.png",
        languageDetails: [
          {
            locale: "fr-FR",
            definition: "Définition",
            note: "Note française",
            userId: null,
            createdAt: "2026-01-03T00:00:00.000Z",
            updatedAt: "2026-01-04T00:00:00.000Z",
          },
        ],
        metadata: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        terms: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            conceptId: "11111111-1111-4111-8111-111111111111",
            locale: "en-US",
            term: "cat",
            description: "Preferred term",
            note: "Term note",
            partOfSpeech: "noun",
            gender: "other",
            termType: "full form",
            url: "https://example.com/term",
            lemma: "cat",
            status: "preferred",
            caseSensitive: true,
            forbidden: false,
            provenance: "manual",
            reviewStatus: "approved",
            metadata: { "provider:source": "fixture" },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            conceptId: "11111111-1111-4111-8111-111111111111",
            locale: "en-US",
            term: "kitty",
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
          {
            id: "44444444-4444-4444-8444-444444444444",
            conceptId: "11111111-1111-4111-8111-111111111111",
            locale: "fr-FR",
            term: "chat",
            description: "",
            note: "",
            partOfSpeech: "noun",
            gender: "masculine",
            termType: "full form",
            url: null,
            lemma: "chat",
            status: "preferred",
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
      {
        id: "55555555-5555-4555-8555-555555555555",
        primaryTerm: "cat",
        subject: "Separate concept",
        definition: "",
        translatable: true,
        note: "",
        url: null,
        figure: null,
        languageDetails: [],
        metadata: {},
        terms: [
          {
            ...makeDocumentTerm(
              "66666666-6666-4666-8666-666666666666",
              "55555555-5555-4555-8555-555555555555",
            ),
            term: "cat",
          },
        ],
      },
    ],
  };
}

function makeDocumentTerm(id: string, conceptId: string) {
  return {
    id,
    conceptId,
    locale: "en-US",
    term: "animal",
    description: "",
    note: "",
    partOfSpeech: "noun",
    gender: null,
    termType: null,
    url: null,
    lemma: null,
    status: "draft",
    caseSensitive: false,
    forbidden: false,
    provenance: "manual",
    reviewStatus: "approved",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

describe("TBX-Basic DCA interchange", () => {
  it("preserves concepts, locales, synonyms, metadata mappings, and XML escaping", () => {
    const serialized = serializeTbx(makeDocument());
    expect(serialized.errors).toEqual([]);
    expect(serialized.content.byteLength).toBeGreaterThan(0);

    const xml = new TextDecoder().decode(serialized.content);
    expect(xml).toContain(`xmlns="${TBX_NAMESPACE}"`);
    expect(xml).toContain('type="TBX-Basic"');
    expect(xml).toContain('style="dca"');
    expect(xml).toContain("<conceptEntry");
    expect(xml).not.toContain("externalKey");
    expect(xml).not.toContain("externalCreatedAt");
    expect(xml.match(/<conceptEntry\b/g)).toHaveLength(2);
    expect(xml.match(/<termSec\b/g)).toHaveLength(4);
    expect(xml).toContain("Product &lt;Terms&gt;");
    expect(xml).toContain("Animals &amp; pets");

    const parsed = parseTbx(xml);
    expect(parsed.diagnostics.filter((entry) => entry.severity === "error")).toEqual([]);
    expect(parsed.concepts).toHaveLength(2);
    expect(parsed.concepts[0]?.terms).toHaveLength(3);
    expect(parsed.concepts[0]?.terms.map((term) => term.locale)).toEqual([
      "en-US",
      "en-US",
      "fr-FR",
    ]);
    expect(parsed.concepts[0]?.terms[0]?.status).toBe("preferred");
    expect(parsed.concepts[0]?.terms[0]?.caseSensitive).toBe(true);
    expect(parsed.concepts[0]?.terms[0]?.url).toBe("https://example.com/term");
    expect(parsed.concepts[0]?.url).toBe("https://example.com/concept");
    expect(parsed.concepts[0]?.figure).toBe("https://example.com/cat.png");
    expect(parsed.concepts[0]?.languageDetails?.[0]?.userId).toBe(null);
    expect(parsed.concepts[0]?.languageDetails?.[0]?.createdAt).toBe("2026-01-03T00:00:00.000Z");
    expect(parsed.concepts[0]?.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(parsed.concepts[0]?.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(parsed.concepts[1]?.id).toBe("55555555-5555-4555-8555-555555555555");
  });

  it("validates generated output against the pinned RELAX NG schema", () => {
    const serialized = serializeTbx(makeDocument());
    const directory = mkdtempSync(join(tmpdir(), "hyperlocalise-tbx-"));
    const documentPath = join(directory, "export.tbx");
    const schemaPath = join(
      process.cwd(),
      "src/lib/glossary/interchange/tbx-validation/TBXcoreStructV03_TBX-Basic_integrated.rng",
    );
    writeFileSync(documentPath, serialized.content);
    expect(() =>
      execFileSync("xmllint", ["--noout", "--relaxng", schemaPath, documentPath], {
        stdio: "pipe",
      }),
    ).not.toThrow();
    rmSync(directory, { recursive: true, force: true });
  });

  it("reports invalid XML characters and unsupported statuses", () => {
    const document = makeDocument();
    const firstTerm = document.concepts[0]?.terms[0];
    if (!firstTerm) throw new Error("fixture term missing");
    firstTerm.term = "bad\u0001term";
    firstTerm.status = "unknown";
    const serialized = serializeTbx(document);
    expect(serialized.errors.some((entry) => entry.code === "invalid_xml_character")).toBe(true);
    expect(serialized.warnings.some((entry) => entry.code === "unsupported_term_status")).toBe(
      true,
    );
  });

  it("rejects malformed XML without truncating valid preceding concepts", () => {
    const parsed = parseTbx(
      '<?xml version="1.0"?><tbx><text><body><conceptEntry id="c1"><langSec xml:lang="en"><termSec id="t1"><term>ok</term></termSec></langSec></conceptEntry><conceptEntry',
    );
    expect(parsed.diagnostics.some((entry) => entry.code === "invalid_xml")).toBe(true);
    expect(parsed.concepts).toHaveLength(1);
  });
});
