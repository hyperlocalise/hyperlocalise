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

import { isOk } from "@/lib/primitives/result/results";

import { parseTmxDocument } from "./parse-tmx";
import {
  serializeMemoryEntriesTmx,
  serializeSegContent,
  serializeTmxDocument,
} from "./serialize-tmx";
import { documentToImportCandidates } from "./tmx-import";

function assertPhraseCompatible(tmx: string) {
  expect(tmx).toContain('<tmx version="1.4">');
  expect(tmx).toContain("creationtool=");
  expect(tmx).toContain("srclang=");
  expect(tmx).toMatch(/<tu tuid="[^"]+"/);
  expect(tmx).toMatch(/<tuv xml:lang="[^"]+"><seg>/);
}

function assertCrowdinCompatible(tmx: string) {
  expect(tmx).toContain('<header ');
  expect(tmx).toContain('srclang="');
  expect(tmx).not.toContain("<!DOCTYPE");
  expect(tmx).toContain("&amp;");
  expect(tmx).toContain("&lt;now&gt;");
}

describe("serializeTmxDocument", () => {
  it("keeps inline codes as XML and escapes text entities", () => {
    expect(serializeSegContent('Hello <ph x="1"/> & friends')).toBe(
      'Hello <ph x="1"/> &amp; friends',
    );
    expect(serializeSegContent("Checkout <now>")).toBe("Checkout &lt;now&gt;");
  });

  it("emits Phrase-compatible TMX 1.4 for multilingual units", () => {
    const tmx = serializeTmxDocument({
      header: { srclang: "en-US", creationtool: "Hyperlocalise" },
      units: [
        {
          tuid: "seg-2",
          creationdate: "20240101T010101Z",
          variants: [
            { language: "en-US", segment: "Checkout" },
            { language: "fr-FR", segment: "Paiement" },
            { language: "de-DE", segment: "Kasse" },
          ],
        },
      ],
    });
    assertPhraseCompatible(tmx);
    const parsed = parseTmxDocument(tmx);
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    expect(documentToImportCandidates(parsed.value).candidates).toHaveLength(2);
  });

  it("emits Crowdin-compatible escaped text that re-imports", () => {
    const tmx = serializeMemoryEntriesTmx([
      {
        sourceLocale: "en",
        targetLocale: "fr",
        sourceText: "Checkout <now>",
        targetText: "Commander & payer",
        tuid: "9",
      },
    ]);
    assertCrowdinCompatible(tmx);
    const parsed = parseTmxDocument(tmx);
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    expect(documentToImportCandidates(parsed.value).candidates[0]).toMatchObject({
      sourceText: "Checkout <now>",
      targetText: "Commander & payer",
    });
  });

  it("groups locale pairs that share a tuid into one unit", () => {
    const tmx = serializeMemoryEntriesTmx([
      {
        sourceLocale: "en-US",
        targetLocale: "fr-FR",
        sourceText: "Cart",
        targetText: "Panier",
        tuid: "seg-1",
      },
      {
        sourceLocale: "en-US",
        targetLocale: "de-DE",
        sourceText: "Cart",
        targetText: "Warenkorb",
        tuid: "seg-1",
      },
    ]);
    expect(tmx.match(/<tu /g)).toHaveLength(1);
    expect(tmx.match(/<tuv /g)).toHaveLength(3);
  });
});
