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
import { createHash } from "node:crypto";

import { describe, expect, it } from "vite-plus/test";

import { parseIntegrationJsonFileExtracted } from "./integration-json-job-output";

const STAMP_KEY = "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV";
const CANVA_KEY = "canva.t.0123456789abcdef";

function hashedSourceLockAliases(sourceText: string): string[] {
  const sha256 = createHash("sha256").update(sourceText, "utf8").digest("hex");
  const normalized = sourceText.normalize("NFKC").replace(/\s+/g, " ").trim();
  const nfkc = createHash("sha256").update(normalized, "utf8").digest("hex");
  return [
    sha256.slice(0, 16),
    sha256.slice(0, 32),
    nfkc.slice(0, 16),
    `json.${sha256.slice(0, 16)}`,
    `json.${nfkc.slice(0, 16)}`,
  ];
}

describe("parseIntegrationJsonFileExtracted", () => {
  it("maps CLI json.<nfkc16> aliases onto Figma stamp keys", () => {
    const source = "Hello world";
    const aliases = hashedSourceLockAliases(source.trim());
    const jsonAlias = aliases.find((alias) => alias.startsWith("json."));
    expect(jsonAlias).toBeTruthy();

    expect(
      parseIntegrationJsonFileExtracted({ [jsonAlias!]: "Xin chào" }, { [STAMP_KEY]: source }),
    ).toEqual({
      [jsonAlias!]: "Xin chào",
      [STAMP_KEY]: "Xin chào",
    });
  });

  it("resolves whitespace and NFKC differences through the nfkc alias", () => {
    const source = "Print\u2028Marketing.";
    const aliases = hashedSourceLockAliases(source.trim());
    const nfkcAlias = aliases[2];
    expect(nfkcAlias).toHaveLength(16);

    const parsed = parseIntegrationJsonFileExtracted(
      { [nfkcAlias]: "In ấn tiếp thị." },
      { [STAMP_KEY]: source },
    );
    expect(parsed[STAMP_KEY]).toBe("In ấn tiếp thị.");
  });

  it("keeps a filled stamp key and does not overwrite it from a hash alias", () => {
    const source = "Hello world";
    const [shortHash] = hashedSourceLockAliases(source.trim());

    expect(
      parseIntegrationJsonFileExtracted(
        { [STAMP_KEY]: "Hola", [shortHash]: "ignored hash" },
        { [STAMP_KEY]: source },
      ),
    ).toEqual({
      [STAMP_KEY]: "Hola",
      [shortHash]: "ignored hash",
    });
  });

  it("lets stamp-parsed values win over hash-mapped collisions", () => {
    const source = "Hello world";
    const [shortHash] = hashedSourceLockAliases(source.trim());

    expect(
      parseIntegrationJsonFileExtracted(
        { [STAMP_KEY]: "stamp wins", [shortHash]: "hash value" },
        { [STAMP_KEY]: source },
      )[STAMP_KEY],
    ).toBe("stamp wins");
  });

  it("parses Canva source-text keys and still remaps hash aliases", () => {
    const source = "Welcome";
    const [shortHash] = hashedSourceLockAliases(source.trim());

    const parsed = parseIntegrationJsonFileExtracted(
      { [CANVA_KEY]: "Bienvenue", [shortHash]: "hash welcome" },
      { [CANVA_KEY]: source },
    );
    expect(parsed[CANVA_KEY]).toBe("Bienvenue");
    expect(parsed[shortHash]).toBe("hash welcome");
  });

  it("still remaps hash aliases when source keys are neither Figma stamps nor Canva keys", () => {
    const source = "Title";
    const jsonAlias = hashedSourceLockAliases(source.trim()).find((alias) =>
      alias.startsWith("json."),
    );
    expect(jsonAlias).toBeTruthy();

    expect(
      parseIntegrationJsonFileExtracted({ [jsonAlias!]: "Tiêu đề" }, { "plain.key": source }),
    ).toEqual({
      [jsonAlias!]: "Tiêu đề",
      "plain.key": "Tiêu đề",
    });
  });

  it("ignores non-string JSON values in the hash layer", () => {
    const source = "Hello world";
    const [shortHash] = hashedSourceLockAliases(source.trim());

    expect(
      parseIntegrationJsonFileExtracted(
        { [shortHash]: { nested: true }, extra: 12 },
        { [STAMP_KEY]: source },
      )[STAMP_KEY],
    ).toBeUndefined();
  });

  it("skips empty source strings", () => {
    const aliases = hashedSourceLockAliases("Hello");
    expect(
      parseIntegrationJsonFileExtracted({ [aliases[0]!]: "Xin chào" }, { [STAMP_KEY]: "   " })[
        STAMP_KEY
      ],
    ).toBeUndefined();
  });
});
