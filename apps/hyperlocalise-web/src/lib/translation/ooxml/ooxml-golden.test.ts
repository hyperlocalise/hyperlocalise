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
import { join } from "node:path";

import JSZip from "jszip";
import { describe, expect, it } from "vite-plus/test";

import { isErr, type Result } from "@/lib/primitives/result/results";

import { applyDocxTranslations, readDocxEntries } from "./docx-document";
import { OOXML_TOKEN_MARKER, ooxmlPlaceholderTokens, type OoxmlEntry } from "./ooxml-paragraph";
import type { OoxmlError } from "./ooxml-tree";
import { OOXML_FIXTURE_DIR, ooxmlFixture, type OoxmlFixtureName } from "./ooxml.fixture";
import { applyPptxTranslations, readPptxEntries } from "./pptx-deck";

// The goldens are written by the Go parser (go test -update-ooxml), so these tests hold the
// TypeScript fallback to the same keys, placeholders, context, and patched part text.
const TEMPLATE_PATTERN = /\{([oca])(\d+)\}/g;
const TOKEN_PATTERN = new RegExp(`${OOXML_TOKEN_MARKER}([A-F0-9]+)_[0-9]+\x1f`, "g");

type Golden = {
  entries: OoxmlEntry[];
  translatedEntries: OoxmlEntry[];
  translatedParts: Record<string, string>;
};

async function readParts(content: Uint8Array): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(content);
  const parts = new Map<string, string>();
  for (const file of Object.values(zip.files)) {
    if (!file.dir) parts.set(file.name, await file.async("string"));
  }
  return parts;
}

function expandTemplate(source: string, template: string): string {
  const tokens = new Map<string, string>();
  for (const match of source.matchAll(TOKEN_PATTERN)) {
    const desc = match[1]!
      .match(/../g)!
      .map((pair) => String.fromCharCode(Number.parseInt(pair, 16)));
    tokens.set(desc.join(""), match[0]);
  }
  return template.replace(TEMPLATE_PATTERN, (raw, kind: string, index: string) => {
    const token = tokens.get(`${kind}${index}`);
    if (!token) throw new Error(`template ${template} names ${raw}, missing from ${source}`);
    return token;
  });
}

function unwrap<T>(result: Result<T, OoxmlError>): T {
  if (isErr(result)) throw new Error(JSON.stringify(result.error));
  return result.value;
}

async function runGolden(
  fixture: OoxmlFixtureName,
  read: (content: Uint8Array) => Promise<Result<OoxmlEntry[], OoxmlError>>,
  apply: (
    template: Uint8Array,
    values: Record<string, string>,
  ) => Promise<Result<Uint8Array, OoxmlError>>,
) {
  const golden = JSON.parse(
    readFileSync(join(OOXML_FIXTURE_DIR, `${fixture}.expected.json`), "utf8"),
  ) as Golden;
  const templates = JSON.parse(
    readFileSync(join(OOXML_FIXTURE_DIR, `${fixture}.translations.json`), "utf8"),
  ) as Record<string, string>;
  const source = await ooxmlFixture(fixture);

  const entries = unwrap(await read(source));
  expect(entries).toEqual(golden.entries);

  const sourceText = new Map(entries.map((entry) => [entry.key, entry.text]));
  const values = Object.fromEntries(
    Object.entries(templates).map(([key, template]) => [
      key,
      expandTemplate(sourceText.get(key) ?? "", template),
    ]),
  );
  const translated = unwrap(await apply(source, values));
  expect(unwrap(await read(translated))).toEqual(golden.translatedEntries);

  const sourceParts = await readParts(source);
  const changed: Record<string, string> = {};
  for (const [name, content] of await readParts(translated)) {
    if (content !== sourceParts.get(name)) changed[name] = content;
  }
  expect(changed).toEqual(golden.translatedParts);

  expect(unwrap(await apply(source, {}))).toBe(source);
}

describe("Office parity with the Go parser", () => {
  it("reads and patches Word documents like the Go golden", async () => {
    await runGolden("docx-basic", readDocxEntries, applyDocxTranslations);
  });

  it("reads and patches PowerPoint decks like the Go golden", async () => {
    await runGolden("pptx-basic", readPptxEntries, applyPptxTranslations);
  });

  it("sorts placeholders for multiset comparison", () => {
    const open = "\x1eHLOXPH_6F30_0\x1f";
    const close = "\x1eHLOXPH_6330_1\x1f";
    expect(ooxmlPlaceholderTokens(`Read ${open}terms${close}`)).toEqual([close, open]);
    expect(ooxmlPlaceholderTokens("plain")).toEqual([]);
  });

  it("rejects packages that are not Office files", async () => {
    const result = await readDocxEntries(new TextEncoder().encode("not a zip"));
    expect(isErr(result) && result.error.code).toBe("invalid_office_file");
  });
});
