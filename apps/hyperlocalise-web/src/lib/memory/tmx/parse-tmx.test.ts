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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { isErr, isOk } from "@/lib/primitives/result/results";

import { parseTmxDocument } from "./parse-tmx";
import { documentToImportCandidates } from "./tmx-import";

const fixtureDir = dirname(fileURLToPath(import.meta.url));

function readFixture(name: string) {
  return readFileSync(join(fixtureDir, "fixtures", name), "utf8");
}

describe("parseTmxDocument", () => {
  it("preserves entities, inline codes, header srclang, notes, and context", () => {
    const parsed = parseTmxDocument(readFixture("tmx-1.4-inline-codes.tmx"));
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;

    expect(parsed.value.header.srclang).toBe("en-US");
    expect(parsed.value.totalUnits).toBe(1);
    const unit = parsed.value.units[0];
    expect(unit?.tuid).toBe("inline-1");
    expect(unit?.notes).toEqual(["Keep the placeholder."]);
    expect(unit?.properties).toEqual([{ type: "x-context", value: "homepage hero" }]);
    expect(unit?.variants[0]?.segment).toBe('Hello <ph x="1"/> world & friends');
    expect(unit?.variants[1]?.segment).toBe('Bonjour <ph x="1"/> le monde & les amis');
  });

  it("reads Phrase-style lang attributes and multilingual units", () => {
    const parsed = parseTmxDocument(readFixture("tmx-phrase-like.tmx"));
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;

    const mapped = documentToImportCandidates(parsed.value);
    const pairs = mapped.candidates.map(
      (candidate) => `${candidate.sourceLocale}->${candidate.targetLocale}`,
    );
    expect(pairs).toEqual(["en-US->fr-FR", "en-US->de-DE", "en-US->fr-FR"]);
    expect(mapped.candidates.filter((candidate) => candidate.isVariant)).toHaveLength(1);
    expect(mapped.candidates[0]?.sourceText).toBe("Checkout");
    expect(mapped.candidates[0]?.externalKey).toBe("tmx:seg-2:en-US:fr-FR");
  });

  it("decodes Crowdin-style escaped markup without flattening", () => {
    const parsed = parseTmxDocument(readFixture("tmx-crowdin-like.tmx"));
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;

    const mapped = documentToImportCandidates(parsed.value);
    expect(mapped.candidates[0]).toMatchObject({
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Checkout <now>",
      targetText: "Commander & payer",
    });
  });

  it("rejects DTD declarations", () => {
    const parsed = parseTmxDocument(
      `<?xml version="1.0"?><!DOCTYPE tmx [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><tmx version="1.4"><body/></tmx>`,
    );
    expect(isErr(parsed)).toBe(true);
    if (!isErr(parsed)) return;
    expect(parsed.error.code).toBe("doctype_forbidden");
  });

  it("rejects unsupported encodings", () => {
    const parsed = parseTmxDocument(
      `<?xml version="1.0" encoding="ISO-8859-1"?><tmx version="1.4"><body><tu><tuv xml:lang="en"><seg>A</seg></tuv><tuv xml:lang="fr"><seg>B</seg></tuv></tu></body></tmx>`,
    );
    expect(isErr(parsed)).toBe(true);
    if (!isErr(parsed)) return;
    expect(parsed.error.code).toBe("unsupported_encoding");
  });

  it("rejects malformed XML", () => {
    const parsed = parseTmxDocument(`<tmx version="1.4"><body><tu>`);
    expect(isErr(parsed)).toBe(true);
    if (!isErr(parsed)) return;
    expect(parsed.error.code).toBe("malformed_xml");
  });

  it("rejects files over the documented unit limit instead of truncating", () => {
    const units = Array.from({ length: 4 }, (_, index) => {
      return `<tu tuid="u${index}"><tuv xml:lang="en"><seg>S${index}</seg></tuv><tuv xml:lang="fr"><seg>T${index}</seg></tuv></tu>`;
    }).join("");
    const parsed = parseTmxDocument(
      `<?xml version="1.0" encoding="UTF-8"?><tmx version="1.4"><header srclang="en" creationtool="t" creationtoolversion="1" segtype="sentence" o-tmf="t" adminlang="en" datatype="plaintext"/><body>${units}</body></tmx>`,
      { maxUnits: 3 },
    );
    expect(isErr(parsed)).toBe(true);
    if (!isErr(parsed)) return;
    expect(parsed.error).toMatchObject({
      code: "unit_limit_exceeded",
      maxUnits: 3,
      unitCount: 4,
    });
  });

  it("skips oversized segments with a unit-level error", () => {
    const huge = "x".repeat(20);
    const parsed = parseTmxDocument(
      `<tmx version="1.4"><header srclang="en" creationtool="t" creationtoolversion="1" segtype="sentence" o-tmf="t" adminlang="en" datatype="plaintext"/><body><tu tuid="big"><tuv xml:lang="en"><seg>${huge}</seg></tuv><tuv xml:lang="fr"><seg>ok</seg></tuv></tu></body></tmx>`,
      { maxSegmentChars: 10 },
    );
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    expect(parsed.value.units).toEqual([]);
    expect(parsed.value.issues).toEqual([
      expect.objectContaining({ code: "oversized_segment", severity: "error", tuid: "big" }),
    ]);
  });
});
