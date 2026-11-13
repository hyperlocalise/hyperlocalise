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

import {
  encodeSanityLastPushRecord,
  isSanityImportedSourceCurrent,
  isSanityRemoteDraftNewer,
  lastPushedAtForSanityLocale,
  parseSanityLastPushRecord,
  readSanityPushSourcePaths,
  recordSanityPushSkip,
  SANITY_REMOTE_NEWER_SLACK_MS,
  selectSanityPushMappings,
  sourceKeysMissingApprovedTranslations,
  summarizeSanityPushResult,
} from "./push-sanity-translations";

describe("sanity push skip reporting", () => {
  it("counts source keys that have no approved translation", () => {
    expect(
      sourceKeysMissingApprovedTranslations(["title", "body", "excerpt"], {
        title: "Titel",
        body: "Inhalt",
      }),
    ).toBe(1);
    expect(sourceKeysMissingApprovedTranslations(["title"], { title: "Titel" })).toBe(0);
  });

  it("explains incomplete, unchanged, and unmapped skips", () => {
    expect(
      recordSanityPushSkip({
        locale: "de-DE",
        reason: "incomplete_translations",
        translatedKeyCount: 4,
        sourceKeyCount: 12,
      }).message,
    ).toBe("de-DE is not fully approved (4 of 12 keys).");
    expect(recordSanityPushSkip({ locale: "fr-FR", reason: "unchanged" }).message).toBe(
      "fr-FR is already pushed and overwrite is off.",
    );
    expect(recordSanityPushSkip({ locale: "ja-JP", reason: "unmapped" }).message).toBe(
      "ja-JP has no matching Sanity language tag.",
    );
    expect(recordSanityPushSkip({ locale: "ja", reason: "unsupported_for_type" }).message).toBe(
      "ja is not configured for this Sanity document type.",
    );
    expect(recordSanityPushSkip({ locale: "de-DE", reason: "remote_newer" }).message).toBe(
      "de-DE has a newer Sanity draft and overwrite is off.",
    );
    expect(recordSanityPushSkip({ locale: "en", reason: "source_changed" }).message).toBe(
      "The Sanity source changed after import; re-import before pushing.",
    );
  });

  it("requires a matching imported source hash before applying translations", () => {
    expect(
      isSanityImportedSourceCurrent({
        liveSourceHash: "abc",
        importedSourceHash: "abc",
      }),
    ).toBe(true);
    expect(
      isSanityImportedSourceCurrent({
        liveSourceHash: "abc",
        importedSourceHash: "def",
      }),
    ).toBe(false);
  });

  it("treats a remote draft as newer only after a previous push", () => {
    const lastPushedAt = new Date("2026-10-11T12:00:00.000Z");
    expect(isSanityRemoteDraftNewer(undefined, lastPushedAt)).toBe(false);
    expect(isSanityRemoteDraftNewer("2026-10-11T13:00:00.000Z", null)).toBe(false);
    expect(isSanityRemoteDraftNewer("2026-10-11T12:00:03.000Z", lastPushedAt)).toBe(false);
    expect(
      isSanityRemoteDraftNewer(
        new Date(lastPushedAt.getTime() + SANITY_REMOTE_NEWER_SLACK_MS + 1).toISOString(),
        lastPushedAt,
      ),
    ).toBe(true);
  });

  it("compares remote drafts against the locale's last push, not a later sibling", () => {
    const localeAPushedAt = new Date("2026-10-11T12:00:00.000Z");
    const localeBPushedAt = new Date("2026-10-11T14:00:00.000Z");
    const hash = "a".repeat(64);
    const mapping = {
      lastPushedAt: localeBPushedAt,
      lastPushContentHash: {
        "de-DE": encodeSanityLastPushRecord(hash, localeAPushedAt),
        "fr-FR": encodeSanityLastPushRecord(hash, localeBPushedAt),
      },
    };

    expect(lastPushedAtForSanityLocale(mapping, "de-DE")?.toISOString()).toBe(
      "2026-10-11T12:00:00.000Z",
    );
    expect(lastPushedAtForSanityLocale(mapping, "fr-FR")?.toISOString()).toBe(
      "2026-10-11T14:00:00.000Z",
    );
    expect(lastPushedAtForSanityLocale(mapping, "ja-JP")?.toISOString()).toBe(
      localeBPushedAt.toISOString(),
    );
    expect(
      isSanityRemoteDraftNewer(
        "2026-10-11T13:00:00.000Z",
        lastPushedAtForSanityLocale(mapping, "de-DE"),
      ),
    ).toBe(true);
    expect(
      isSanityRemoteDraftNewer(
        "2026-10-11T13:00:00.000Z",
        lastPushedAtForSanityLocale(mapping, "fr-FR"),
      ),
    ).toBe(false);
    expect(parseSanityLastPushRecord(hash)).toEqual({ hash, pushedAt: null });
    expect(parseSanityLastPushRecord(mapping.lastPushContentHash["de-DE"]).hash).toBe(hash);
  });

  it("summarizes why locales were skipped", () => {
    expect(
      summarizeSanityPushResult({
        pushedLocales: 0,
        failedLocales: 0,
        skipped: [
          recordSanityPushSkip({
            locale: "de-DE",
            reason: "incomplete_translations",
            translatedKeyCount: 4,
            sourceKeyCount: 12,
          }),
          recordSanityPushSkip({
            locale: "fr-FR",
            reason: "incomplete_translations",
            translatedKeyCount: 4,
            sourceKeyCount: 12,
          }),
        ],
        unmappedLocales: [],
      }),
    ).toBe("Skipped 2 locales because not every key is approved.");
    expect(
      summarizeSanityPushResult({
        pushedLocales: 0,
        failedLocales: 0,
        skipped: [recordSanityPushSkip({ locale: "de-DE", reason: "unchanged" })],
        unmappedLocales: [],
      }),
    ).toBe("Skipped 1 locale because Sanity drafts are already up to date.");
    expect(
      summarizeSanityPushResult({
        pushedLocales: 0,
        failedLocales: 0,
        skipped: [recordSanityPushSkip({ locale: "de-DE", reason: "remote_newer" })],
        unmappedLocales: [],
      }),
    ).toBe("Skipped 1 locale because Sanity drafts were updated remotely.");
    expect(
      summarizeSanityPushResult({
        pushedLocales: 0,
        failedLocales: 0,
        skipped: [],
        unmappedLocales: ["zh-TW", "pt-BR"],
      }),
    ).toBe("Skipped 2 locales with no matching Sanity language tag.");
    expect(
      summarizeSanityPushResult({
        pushedLocales: 0,
        failedLocales: 0,
        skipped: [recordSanityPushSkip({ locale: "en", reason: "source_changed" })],
        unmappedLocales: [],
      }),
    ).toBe("Skipped because the Sanity source changed after import.");
  });
});

describe("readSanityPushSourcePaths", () => {
  it("returns only non-empty string paths from the run snapshot", () => {
    expect(readSanityPushSourcePaths(undefined)).toBeUndefined();
    expect(readSanityPushSourcePaths({})).toBeUndefined();
    expect(readSanityPushSourcePaths({ sourcePaths: "sanity/page.json" })).toBeUndefined();
    expect(
      readSanityPushSourcePaths({
        sourcePaths: ["sanity/page.json", "  ", 12, "sanity/author.json"],
      }),
    ).toEqual(["sanity/page.json", "sanity/author.json"]);
  });
});

describe("selectSanityPushMappings", () => {
  const mappings = [
    { sourcePath: "sanity/page.json", documentId: "page-1" },
    { sourcePath: "sanity/author.json", documentId: "author-1" },
  ];

  it("keeps every mapping when the snapshot does not select paths", () => {
    expect(selectSanityPushMappings(mappings)).toEqual(mappings);
  });

  it("filters to the selected source paths", () => {
    expect(selectSanityPushMappings(mappings, ["sanity/author.json", ""])).toEqual([mappings[1]]);
  });
});
