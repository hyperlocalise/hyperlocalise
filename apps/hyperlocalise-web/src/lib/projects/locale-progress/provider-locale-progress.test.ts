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

import { normalizeProviderLocaleProgress } from "./provider-locale-progress";

describe("normalizeProviderLocaleProgress", () => {
  it("maps Crowdin language progress onto project locales", () => {
    const rows = normalizeProviderLocaleProgress({
      targetLocales: ["vi-VN", "fr-FR"],
      readiness: {
        vi: {
          translationProgress: 14,
          approvalProgress: 0,
          words: { total: 34, translated: 5, approved: 0 },
          phrases: { total: 8, translated: 1, approved: 0 },
        },
      },
    });

    expect(rows).toEqual([
      {
        locale: "vi-VN",
        translationProgress: 14,
        approvalProgress: 0,
        words: { total: 34, translated: 5, approved: 0 },
        phrases: { total: 8, translated: 1, approved: 0 },
        lastActivityAt: null,
      },
      {
        locale: "fr-FR",
        translationProgress: 0,
        approvalProgress: 0,
        words: { total: 0, translated: 0, approved: 0 },
        phrases: { total: 0, translated: 0, approved: 0 },
        lastActivityAt: null,
      },
    ]);
  });

  it("maps Smartling completed and authorized string counts", () => {
    const rows = normalizeProviderLocaleProgress({
      targetLocales: ["fr-FR"],
      readiness: {
        "fr-FR": {
          completedStringCount: 8,
          authorizedStringCount: 20,
          lastCompleted: "2026-08-19T01:42:00.000Z",
        },
      },
    });

    expect(rows[0]).toMatchObject({
      locale: "fr-FR",
      translationProgress: 40,
      approvalProgress: 0,
      phrases: { total: 20, translated: 8, approved: 0 },
      lastActivityAt: "2026-08-19T01:42:00.000Z",
    });
  });

  it("returns empty counts when readiness is missing", () => {
    expect(
      normalizeProviderLocaleProgress({
        targetLocales: ["de-DE"],
        readiness: null,
      }),
    ).toEqual([
      {
        locale: "de-DE",
        translationProgress: 0,
        approvalProgress: 0,
        words: { total: 0, translated: 0, approved: 0 },
        phrases: { total: 0, translated: 0, approved: 0 },
        lastActivityAt: null,
      },
    ]);
  });
});
