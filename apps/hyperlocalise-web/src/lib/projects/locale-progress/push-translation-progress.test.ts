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

import {
  addPushTranslationProgressTotals,
  emptyPushTranslationProgressTotals,
  loadPushLocaleTranslationProgress,
  pushLocaleHasApprovedTranslations,
  pushTranslationProgressPercents,
  toPushLocaleProgressRow,
} from "./push-translation-progress";

describe("pushTranslationProgressPercents", () => {
  it("returns zeros when there are no keys", () => {
    expect(pushTranslationProgressPercents(emptyPushTranslationProgressTotals())).toEqual({
      translationProgress: 0,
      approvalProgress: 0,
    });
  });

  it("shows translated work without approval", () => {
    expect(
      pushTranslationProgressPercents({
        translatedKeyCount: 2,
        approvedKeyCount: 0,
        loadedKeyCount: 4,
      }),
    ).toEqual({
      translationProgress: 50,
      approvalProgress: 0,
    });
  });

  it("shows both percents when some keys are approved", () => {
    expect(
      pushTranslationProgressPercents({
        translatedKeyCount: 4,
        approvedKeyCount: 1,
        loadedKeyCount: 4,
      }),
    ).toEqual({
      translationProgress: 100,
      approvalProgress: 25,
    });
  });
});

describe("toPushLocaleProgressRow", () => {
  it("attaches percents to one locale", () => {
    expect(
      toPushLocaleProgressRow("vi-VN", {
        translatedKeyCount: 4,
        approvedKeyCount: 4,
        loadedKeyCount: 4,
      }),
    ).toEqual({
      locale: "vi-VN",
      translationProgress: 100,
      approvalProgress: 100,
    });
  });
});

describe("addPushTranslationProgressTotals", () => {
  it("sums locale totals", () => {
    const totals = emptyPushTranslationProgressTotals();
    addPushTranslationProgressTotals(totals, {
      translatedKeyCount: 2,
      approvedKeyCount: 1,
      loadedKeyCount: 3,
    });
    addPushTranslationProgressTotals(totals, {
      translatedKeyCount: 1,
      approvedKeyCount: 0,
      loadedKeyCount: 2,
    });
    expect(totals).toEqual({
      translatedKeyCount: 3,
      approvedKeyCount: 1,
      loadedKeyCount: 5,
    });
  });
});

describe("pushLocaleHasApprovedTranslations", () => {
  it("uses a single approved-only load", async () => {
    const load = vi.fn().mockResolvedValue({
      translatedKeyCount: 2,
      loadedKeyCount: 4,
      prefilled: {},
    });
    await expect(
      pushLocaleHasApprovedTranslations(load, {
        organizationId: "org-1",
        projectId: "project-1",
        sourcePath: "google-drive/a.docx",
        targetLocale: "vi-VN",
      }),
    ).resolves.toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "google-drive/a.docx",
      targetLocale: "vi-VN",
      approvedTranslationsOnly: true,
      readyTranslationsOnly: true,
    });
  });
});

describe("loadPushLocaleTranslationProgress", () => {
  const input = {
    organizationId: "org-1",
    projectId: "project-1",
    sourcePath: "google-drive/overview.docx",
    targetLocale: "vi-VN",
  };

  it("skips the approved load when nothing is translated", async () => {
    const load = vi.fn().mockResolvedValue({
      translatedKeyCount: 0,
      loadedKeyCount: 6,
      prefilled: {},
    });
    await expect(loadPushLocaleTranslationProgress(load, input)).resolves.toEqual({
      translatedKeyCount: 0,
      approvedKeyCount: 0,
      loadedKeyCount: 6,
      approvedPrefilled: {},
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith({
      ...input,
      readyTranslationsOnly: true,
    });
  });

  it("loads approved keys after ready translations exist", async () => {
    const load = vi
      .fn()
      .mockImplementation(async (request: { approvedTranslationsOnly?: boolean }) => {
        if (request.approvedTranslationsOnly) {
          return { translatedKeyCount: 1, loadedKeyCount: 4, prefilled: { title: "Xin chào" } };
        }
        return { translatedKeyCount: 3, loadedKeyCount: 4, prefilled: { title: "Xin chào" } };
      });
    await expect(loadPushLocaleTranslationProgress(load, input)).resolves.toEqual({
      translatedKeyCount: 3,
      approvedKeyCount: 1,
      loadedKeyCount: 4,
      approvedPrefilled: { title: "Xin chào" },
    });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
