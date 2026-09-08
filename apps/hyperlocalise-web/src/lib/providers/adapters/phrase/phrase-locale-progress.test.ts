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
import { describe, expect, it, vi } from "vite-plus/test";

import { phraseTmsProvider } from "./phrase-provider";

describe("mapLocaleStatisticsToReadiness", () => {
  it("maps Phrase locale statistics onto word and string progress", () => {
    expect(
      phraseTmsProvider.mapLocaleStatisticsToReadiness({
        keysTotalCount: 8,
        keysUntranslatedCount: 3,
        wordsTotalCount: 34,
        translationsCompletedCount: 5,
        translationsUnverifiedCount: 1,
        unverifiedWordsCount: 4,
        missingWordsCount: 29,
      }),
    ).toEqual({
      translationProgress: 15,
      approvalProgress: 3,
      words: { total: 34, translated: 5, approved: 1 },
      phrases: { total: 8, translated: 5, approved: 4 },
    });
  });
});

describe("loadProjectLocaleReadiness", () => {
  it("loads Phrase locale show statistics for target locales", async () => {
    const client = {
      listLocales: vi.fn(async () => [
        { id: "loc-en", name: "en", code: "en-US", default: true, statistics: null },
        { id: "loc-fr", name: "fr", code: "fr-FR", default: false, statistics: null },
      ]),
      getLocale: vi.fn(async () => ({
        id: "loc-fr",
        name: "fr",
        code: "fr-FR",
        default: false,
        statistics: {
          keysTotalCount: 8,
          keysUntranslatedCount: 3,
          wordsTotalCount: 34,
          translationsCompletedCount: 5,
          translationsUnverifiedCount: 1,
          unverifiedWordsCount: 4,
          missingWordsCount: 29,
        },
      })),
    };

    const readiness = await phraseTmsProvider.loadProjectLocaleReadiness({
      client: client as never,
      projectId: "proj-1",
    });

    expect(client.getLocale).toHaveBeenCalledWith("proj-1", "loc-fr");
    expect(client.getLocale).not.toHaveBeenCalledWith("proj-1", "loc-en");
    expect(readiness).toEqual({
      "fr-FR": {
        translationProgress: 15,
        approvalProgress: 3,
        words: { total: 34, translated: 5, approved: 1 },
        phrases: { total: 8, translated: 5, approved: 4 },
      },
    });
  });

  it("returns a single locale when languageId matches the Phrase locale id", async () => {
    const client = {
      listLocales: vi.fn(async () => [
        { id: "loc-fr", name: "fr", code: "fr-FR", default: false, statistics: null },
      ]),
      getLocale: vi.fn(async () => ({
        id: "loc-fr",
        name: "fr",
        code: "fr-FR",
        default: false,
        statistics: {
          keysTotalCount: 8,
          keysUntranslatedCount: 3,
          wordsTotalCount: 34,
          translationsCompletedCount: 5,
          translationsUnverifiedCount: 1,
          unverifiedWordsCount: 4,
          missingWordsCount: 29,
        },
      })),
    };

    await expect(
      phraseTmsProvider.loadProjectLocaleReadiness({
        client: client as never,
        projectId: "proj-1",
        languageId: "loc-fr",
      }),
    ).resolves.toEqual({
      translationProgress: 15,
      approvalProgress: 3,
      words: { total: 34, translated: 5, approved: 1 },
      phrases: { total: 8, translated: 5, approved: 4 },
    });
  });
});
