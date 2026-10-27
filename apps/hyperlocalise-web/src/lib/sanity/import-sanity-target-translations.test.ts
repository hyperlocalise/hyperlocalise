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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const importApprovedMock = vi.hoisted(() => vi.fn());
const loadAsPrefilledEntriesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  importApprovedProjectTranslationsFromEntries: (...args: unknown[]) => importApprovedMock(...args),
  ProjectTranslationService: class {
    loadAsPrefilledEntries(...args: unknown[]) {
      return loadAsPrefilledEntriesMock(...args);
    }
  },
}));

import { hashSanityTranslationMap } from "./document-json";
import { importSanityTargetTranslations } from "./import-sanity-target-translations";

const localeMapping = {
  jobTargetLocales: ["de-DE", "fr-FR"],
  intercomTargetLocales: ["de", "fr"],
};

const targetMapsBySanityLocale = {
  de: { title: "Hallo", body: "Willkommen" },
  fr: { title: "Bonjour", body: "Bienvenue" },
};

function presenceCalls(targetLocale: string) {
  return loadAsPrefilledEntriesMock.mock.calls.filter(
    ([input]) =>
      input &&
      typeof input === "object" &&
      "targetLocale" in input &&
      input.targetLocale === targetLocale,
  );
}

describe("importSanityTargetTranslations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    importApprovedMock.mockResolvedValue({ matched: 2, imported: 2, skipped: 0 });
    loadAsPrefilledEntriesMock.mockImplementation(
      async (input: { targetLocale: string; approvedTranslationsOnly: boolean }) => {
        if (input.targetLocale === "fr-FR") {
          return { prefilled: { title: "Bonjour" }, translatedKeyCount: 1 };
        }
        return { prefilled: {}, translatedKeyCount: 0 };
      },
    );
  });

  it("imports empty locales and skips locales that already have approved copy", async () => {
    const result = await importSanityTargetTranslations({
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "sanity/abc123/production/page/home.json",
      localeMapping,
      targetMapsBySanityLocale,
      policy: "seed_empty",
    });

    expect(result.importedLocales).toEqual(["de-DE"]);
    expect(result.skippedLocales).toEqual(["fr-FR"]);
    expect(result.failedLocales).toEqual([]);
    expect(result.pushReadyLocales).toEqual(["fr-FR"]);
    expect(result.importedTranslationHashes["de-DE"]).toBe(
      hashSanityTranslationMap(targetMapsBySanityLocale.de),
    );
    expect(importApprovedMock).toHaveBeenCalledTimes(1);
    expect(importApprovedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLocale: "de-DE",
        entries: targetMapsBySanityLocale.de,
      }),
    );
  });

  it("skips an empty remote map without writing translations", async () => {
    const result = await importSanityTargetTranslations({
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "sanity/abc123/production/page/home.json",
      localeMapping: {
        jobTargetLocales: ["de-DE"],
        intercomTargetLocales: ["de"],
      },
      targetMapsBySanityLocale: { de: {} },
      policy: "seed_empty",
    });

    expect(result.skippedLocales).toEqual(["de-DE"]);
    expect(result.importedLocales).toEqual([]);
    expect(importApprovedMock).not.toHaveBeenCalled();
    expect(presenceCalls("de-DE")).toHaveLength(2);
  });

  it("never clobbers unfinished human work under seed_empty", async () => {
    loadAsPrefilledEntriesMock.mockResolvedValue({
      prefilled: { title: "Entwurf" },
      translatedKeyCount: 1,
    });

    const result = await importSanityTargetTranslations({
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "sanity/abc123/production/page/home.json",
      localeMapping: {
        jobTargetLocales: ["de-DE"],
        intercomTargetLocales: ["de"],
      },
      targetMapsBySanityLocale: { de: targetMapsBySanityLocale.de },
      policy: "seed_empty",
    });

    expect(result.importedLocales).toEqual([]);
    expect(result.skippedLocales).toEqual(["de-DE"]);
    expect(importApprovedMock).not.toHaveBeenCalled();
  });

  it("refreshes import-only copy when the Sanity hash changed", async () => {
    loadAsPrefilledEntriesMock.mockResolvedValue({
      prefilled: { title: "Alt" },
      translatedKeyCount: 1,
    });

    const result = await importSanityTargetTranslations({
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "sanity/abc123/production/page/home.json",
      localeMapping: {
        jobTargetLocales: ["de-DE"],
        intercomTargetLocales: ["de"],
      },
      targetMapsBySanityLocale: { de: targetMapsBySanityLocale.de },
      policy: "refresh_imported",
      storedImportedHashes: { "de-DE": "old-hash" },
    });

    expect(result.importedLocales).toEqual(["de-DE"]);
    expect(result.importedTranslationHashes["de-DE"]).toBe(
      hashSanityTranslationMap(targetMapsBySanityLocale.de),
    );
    expect(importApprovedMock).toHaveBeenCalledTimes(1);
  });

  it("records a failed locale and continues the remaining locales", async () => {
    importApprovedMock
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ matched: 2, imported: 2, skipped: 0 });
    loadAsPrefilledEntriesMock.mockResolvedValue({ prefilled: {}, translatedKeyCount: 0 });

    const result = await importSanityTargetTranslations({
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "sanity/abc123/production/page/home.json",
      localeMapping,
      targetMapsBySanityLocale,
      policy: "seed_empty",
    });

    expect(result.failedLocales).toEqual(["de-DE"]);
    expect(result.importedLocales).toEqual(["fr-FR"]);
  });

  it("skips a locale when the importer matches no keys", async () => {
    importApprovedMock.mockResolvedValue({ matched: 0, imported: 0, skipped: 0 });
    loadAsPrefilledEntriesMock.mockResolvedValue({ prefilled: {}, translatedKeyCount: 0 });

    const result = await importSanityTargetTranslations({
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "sanity/abc123/production/page/home.json",
      localeMapping: {
        jobTargetLocales: ["de-DE"],
        intercomTargetLocales: ["de"],
      },
      targetMapsBySanityLocale: { de: targetMapsBySanityLocale.de },
      policy: "seed_empty",
    });

    expect(result.importedLocales).toEqual([]);
    expect(result.skippedLocales).toEqual(["de-DE"]);
    expect(result.importedTranslationHashes["de-DE"]).toBeUndefined();
  });

  it("adds a skipped empty locale to pushReady when a later load finds approved copy", async () => {
    loadAsPrefilledEntriesMock.mockImplementation(
      async (input: { targetLocale: string; approvedTranslationsOnly: boolean }) => {
        if (input.targetLocale === "de-DE" && input.approvedTranslationsOnly) {
          return { prefilled: { title: "Hallo" }, translatedKeyCount: 1 };
        }
        return { prefilled: {}, translatedKeyCount: 0 };
      },
    );

    const result = await importSanityTargetTranslations({
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "sanity/abc123/production/page/home.json",
      localeMapping: {
        jobTargetLocales: ["de-DE"],
        intercomTargetLocales: ["de"],
      },
      targetMapsBySanityLocale: { de: {} },
      policy: "seed_empty",
    });

    expect(result.skippedLocales).toEqual(["de-DE"]);
    expect(result.pushReadyLocales).toEqual(["de-DE"]);
  });

  it("ignores a project locale that has no mapped Sanity language tag", async () => {
    const result = await importSanityTargetTranslations({
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "sanity/abc123/production/page/home.json",
      localeMapping: {
        jobTargetLocales: ["de-DE"],
        intercomTargetLocales: [],
      },
      targetMapsBySanityLocale,
      policy: "seed_empty",
    });

    expect(result).toEqual({
      importedLocales: [],
      skippedLocales: [],
      failedLocales: [],
      importedTranslationHashes: {},
      pushReadyLocales: [],
    });
    expect(importApprovedMock).not.toHaveBeenCalled();
  });
});
