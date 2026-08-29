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
import "dotenv/config";

import { describe, expect, it } from "vite-plus/test";

import { asTuid, buildMemoryTmxFilename, trailingTuidGroup } from "./export-memory-entries";
import type { TmxExportEntry } from "./tmx/tmx-types";

function entry(partial: Partial<TmxExportEntry> & Pick<TmxExportEntry, "tuid">): TmxExportEntry {
  return {
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    sourceText: "Hello",
    targetText: "Bonjour",
    metadata: {},
    ...partial,
  };
}

describe("asTuid", () => {
  it("prefers metadata.tuid over the external key", () => {
    expect(asTuid({ tuid: "seg-meta" }, "tmx:seg-key:en-US:fr-FR")).toBe("seg-meta");
  });

  it("ignores blank metadata.tuid and falls back to the tmx external key", () => {
    expect(asTuid({ tuid: "  " }, "tmx:seg-1:en-US:fr-FR")).toBe("seg-1");
    expect(asTuid({}, "tmx:seg-2:en-US:de-DE")).toBe("seg-2");
  });

  it("returns undefined when neither metadata nor a tmx key provides a tuid", () => {
    expect(asTuid({}, null)).toBeUndefined();
    expect(asTuid({}, "legacy:seg-1")).toBeUndefined();
    expect(asTuid({}, "tmx:")).toBeUndefined();
  });
});

describe("trailingTuidGroup", () => {
  it("flushes everything when the last entry has no tuid", () => {
    const entries = [entry({ tuid: "a" }), entry({ tuid: undefined })];
    expect(trailingTuidGroup(entries)).toEqual({ flush: entries, pending: [] });
  });

  it("holds back the trailing same-tuid group so page boundaries stay multilingual", () => {
    const entries = [
      entry({ tuid: "a", targetLocale: "fr-FR" }),
      entry({ tuid: "b", targetLocale: "fr-FR" }),
      entry({ tuid: "b", targetLocale: "de-DE" }),
      entry({ tuid: "c", targetLocale: "fr-FR" }),
      entry({ tuid: "c", targetLocale: "de-DE" }),
    ];

    expect(trailingTuidGroup(entries)).toEqual({
      flush: entries.slice(0, 3),
      pending: entries.slice(3),
    });
  });

  it("holds back the whole page when every entry shares the trailing tuid", () => {
    const entries = [
      entry({ tuid: "only", targetLocale: "fr-FR" }),
      entry({ tuid: "only", targetLocale: "de-DE" }),
    ];

    expect(trailingTuidGroup(entries)).toEqual({
      flush: [],
      pending: entries,
    });
  });
});

describe("buildMemoryTmxFilename", () => {
  it("slugifies the memory name and appends locale filters when both are set", () => {
    expect(
      buildMemoryTmxFilename("  My TM / v2  ", { sourceLocale: "en", targetLocale: "fr" }),
    ).toBe("My-TM-v2-en-fr.tmx");
  });

  it("falls back to translation-memory.tmx for blank names without locale filters", () => {
    expect(buildMemoryTmxFilename("   ", {})).toBe("translation-memory.tmx");
    expect(buildMemoryTmxFilename("Product Copy", { sourceLocale: "en" })).toBe("Product-Copy.tmx");
  });
});
