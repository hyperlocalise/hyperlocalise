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

import { isOk } from "@/lib/primitives/result/results";

import { parseTmxDocument } from "./parse-tmx";
import { serializeMemoryEntriesTmx } from "./serialize-tmx";
import { documentToImportCandidates } from "./tmx-import";

const fixtureDir = dirname(fileURLToPath(import.meta.url));

function readFixture(name: string) {
  return readFileSync(join(fixtureDir, "fixtures", name), "utf8");
}

function importThenExport(xml: string) {
  const parsed = parseTmxDocument(xml);
  expect(isOk(parsed)).toBe(true);
  if (!isOk(parsed)) {
    throw new Error("expected parse success");
  }
  const { candidates } = documentToImportCandidates(parsed.value);
  const exported = serializeMemoryEntriesTmx(
    candidates.map((candidate) => ({
      sourceLocale: candidate.sourceLocale,
      targetLocale: candidate.targetLocale,
      sourceText: candidate.sourceText,
      targetText: candidate.targetText,
      tuid: candidate.tuid,
      metadata: candidate.metadata,
    })),
    { srclang: parsed.value.header.srclang },
  );
  const reparsed = parseTmxDocument(exported);
  expect(isOk(reparsed)).toBe(true);
  if (!isOk(reparsed)) {
    throw new Error("expected reparse success");
  }
  return {
    original: candidates,
    exported,
    roundTripped: documentToImportCandidates(reparsed.value).candidates,
  };
}

describe("TMX round-trip", () => {
  it("round-trips inline codes and entities without content loss", () => {
    const { original, exported, roundTripped } = importThenExport(
      readFixture("tmx-1.4-inline-codes.tmx"),
    );
    expect(exported).toContain('<ph x="1"/>');
    expect(exported).toContain("&amp;");
    expect(roundTripped.map((candidate) => candidate.sourceText)).toEqual(
      original.map((candidate) => candidate.sourceText),
    );
    expect(roundTripped.map((candidate) => candidate.targetText)).toEqual(
      original.map((candidate) => candidate.targetText),
    );
    expect(roundTripped[0]?.metadata).toMatchObject({
      tuid: "inline-1",
      context: "homepage hero",
      notes: ["Keep the placeholder."],
    });
  });

  it("round-trips Phrase multilingual fixtures", () => {
    const { original, roundTripped } = importThenExport(readFixture("tmx-phrase-like.tmx"));
    expect(roundTripped).toHaveLength(original.length);
    expect(roundTripped.map((candidate) => candidate.targetText).sort()).toEqual(
      original.map((candidate) => candidate.targetText).sort(),
    );
  });

  it("round-trips Crowdin entity fixtures", () => {
    const { original, roundTripped } = importThenExport(readFixture("tmx-crowdin-like.tmx"));
    expect(roundTripped[0]).toMatchObject({
      sourceText: original[0]?.sourceText,
      targetText: original[0]?.targetText,
    });
  });
});
