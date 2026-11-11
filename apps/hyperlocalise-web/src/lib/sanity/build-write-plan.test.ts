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

const mocks = vi.hoisted(() => ({
  getRepositorySourceFileByPath: vi.fn(),
  listKeysForFile: vi.fn(),
  loadAsPrefilledEntries: vi.fn(),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  ProjectTranslationService: class {
    getRepositorySourceFileByPath = mocks.getRepositorySourceFileByPath;
    listKeysForFile = mocks.listKeysForFile;
    loadAsPrefilledEntries = mocks.loadAsPrefilledEntries;
  },
}));

import { buildSanityPluginWritePlan } from "./build-write-plan";

const auth = {
  organization: { localOrganizationId: "org_1" },
} as never;

describe("buildSanityPluginWritePlan", () => {
  beforeEach(() => {
    mocks.getRepositorySourceFileByPath.mockReset();
    mocks.listKeysForFile.mockReset();
    mocks.loadAsPrefilledEntries.mockReset();
  });

  it("includes unapproved translations and does not list them as missing", async () => {
    mocks.getRepositorySourceFileByPath.mockResolvedValue({ id: "file_1" });
    mocks.listKeysForFile.mockResolvedValue([{ key: "sanity.k.title" }, { key: "sanity.k.body" }]);
    mocks.loadAsPrefilledEntries.mockResolvedValue({
      prefilled: { "sanity.k.title": "Bonjour" },
      translatedKeyCount: 1,
    });

    const write = await buildSanityPluginWritePlan({
      auth,
      projectId: "proj_1",
      sourcePath: "sanity-plugin/p/d/product/hello.json",
      document: { _type: "product", title: "Hello", body: "World" },
      i18nMode: "document",
      sourceSanityLocale: "en-US",
      targetSanityLocale: "fr-FR",
    });

    expect(mocks.loadAsPrefilledEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        approvedTranslationsOnly: false,
        readyTranslationsOnly: false,
        targetLocale: "fr-FR",
      }),
    );
    expect(write.translatedKeyCount).toBe(1);
    expect(write.missingKeys).toEqual(["sanity.k.body"]);
    expect(write.document.title).toBe("Bonjour");
    expect(write.document.language).toBe("fr-FR");
  });
});
