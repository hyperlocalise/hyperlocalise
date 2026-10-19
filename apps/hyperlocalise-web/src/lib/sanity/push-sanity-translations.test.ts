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
  recordSanityPushSkip,
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
        skipped: [],
        unmappedLocales: ["zh-TW", "pt-BR"],
      }),
    ).toBe("Skipped 2 locales with no matching Sanity language tag.");
  });
});
