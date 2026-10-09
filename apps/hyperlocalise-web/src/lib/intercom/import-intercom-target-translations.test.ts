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

const replaceImageVariantBytesMock = vi.hoisted(() => vi.fn());
const importApprovedMock = vi.hoisted(() => vi.fn());
const getLatestVersionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/file-storage/records", () => ({
  getLatestRepositorySourceFileVersion: (...args: unknown[]) => getLatestVersionMock(...args),
}));

vi.mock("@/lib/projects/files/image-variant-service", () => ({
  replaceImageVariantBytes: (...args: unknown[]) => replaceImageVariantBytesMock(...args),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  importApprovedProjectTranslationsFromEntries: (...args: unknown[]) => importApprovedMock(...args),
}));

vi.mock("@/lib/translation/sandbox", () => ({
  createTranslationSandbox: vi.fn(),
  extractSandboxEntries: vi.fn(),
  prepareSandbox: vi.fn(),
  stopTranslationSandbox: vi.fn(),
  writeFilesToSandbox: vi.fn(),
}));

vi.mock("@/lib/database/client", () => ({
  db: {},
  schema: {},
}));

vi.mock("./push-eligibility", () => ({
  loadApprovedIntercomArticleValuesByPath: vi.fn(),
}));

import { hashIntercomArticleContent } from "./article-markdown";
import {
  importIntercomTargetTranslations,
  remainingIntercomJobTargetLocales,
} from "./import-intercom-target-translations";
import type { IntercomLocaleTranslationPresence } from "./intercom-existing-translation-policy";

const localeMapping = {
  sourceIntercomLocale: "en",
  jobTargetLocales: ["de-DE", "fr-FR"],
  intercomTargetLocales: ["de", "fr"],
};

const localeContent = {
  de: { title: "Hallo", description: "", body: "Willkommen" },
  fr: { title: "Bonjour", description: "Intro", body: "Bienvenue" },
};

function emptyPresence(): IntercomLocaleTranslationPresence {
  return {
    pushReady: false,
    hasExistingTranslation: false,
    importProvenanceOnly: false,
    contentHash: null,
  };
}

describe("remainingIntercomJobTargetLocales", () => {
  it("omits locales that were just imported or are already push-ready", () => {
    expect(
      remainingIntercomJobTargetLocales({
        jobTargetLocales: ["de-DE", "fr-FR", "ja-JP"],
        importedProjectLocales: ["fr-FR"],
        pushReadyProjectLocales: ["de-DE"],
      }),
    ).toEqual(["ja-JP"]);
  });

  it("keeps empty German after French Intercom copy is imported", () => {
    expect(
      remainingIntercomJobTargetLocales({
        jobTargetLocales: ["de-DE", "fr-FR"],
        importedProjectLocales: ["fr-FR"],
        pushReadyProjectLocales: ["fr-FR"],
      }),
    ).toEqual(["de-DE"]);
  });

  it("includes push-ready locales when the source changed", () => {
    expect(
      remainingIntercomJobTargetLocales({
        jobTargetLocales: ["de-DE", "fr-FR"],
        importedProjectLocales: [],
        pushReadyProjectLocales: ["fr-FR"],
        sourceUnchanged: false,
      }),
    ).toEqual(["de-DE", "fr-FR"]);
  });
});

describe("importIntercomTargetTranslations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLatestVersionMock.mockResolvedValue({ repositorySourceFileId: "rsf_1" });
    replaceImageVariantBytesMock.mockResolvedValue({ ok: true, value: { id: "variant_1" } });
    importApprovedMock.mockResolvedValue({ matched: 2, imported: 2, skipped: 0 });
  });

  it("imports empty Hyperlocalise locales and skips locales that are already push-ready", async () => {
    const extractEntries = vi.fn(async () => {
      return new Map([
        ["de-DE", { "md.frontmatter/title": "Hallo", "md.paragraph/0": "Willkommen" }],
      ]);
    });
    const presence = new Map<string, IntercomLocaleTranslationPresence>([
      ["de-DE", emptyPresence()],
      [
        "fr-FR",
        {
          pushReady: true,
          hasExistingTranslation: true,
          importProvenanceOnly: false,
          contentHash: "human",
        },
      ],
    ]);

    const result = await importIntercomTargetTranslations({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "intercom/help/getting-started.md",
      localeMapping,
      localeContent,
      policy: "seed_empty",
      extractEntries,
      loadPresence: async () => presence,
    });

    expect(result.importedLocales).toEqual(["de-DE"]);
    expect(result.skippedLocales).toEqual(["fr-FR"]);
    expect(result.failedLocales).toEqual([]);
    expect(result.importedTranslationHashes["de-DE"]).toBe(
      hashIntercomArticleContent(localeContent.de),
    );
    expect(
      remainingIntercomJobTargetLocales({
        jobTargetLocales: localeMapping.jobTargetLocales,
        importedProjectLocales: result.importedLocales,
        pushReadyProjectLocales: result.pushReadyLocales,
      }),
    ).toEqual([]);
    expect(replaceImageVariantBytesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLocale: "de-DE",
        provenance: "import",
        status: "approved",
        force: false,
      }),
    );
    expect(importApprovedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLocale: "de-DE",
        entries: { "md.frontmatter/title": "Hallo", "md.paragraph/0": "Willkommen" },
      }),
    );
  });

  it("skips unfinished keyed work but still seeds empty placeholder locales", async () => {
    const extractEntries = vi.fn(async () => {
      return new Map([
        ["de-DE", { "md.frontmatter/title": "Hallo", "md.paragraph/0": "Willkommen" }],
      ]);
    });
    const result = await importIntercomTargetTranslations({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "intercom/help/getting-started.md",
      localeMapping,
      localeContent,
      policy: "seed_empty",
      extractEntries,
      loadPresence: async () =>
        new Map([
          ["de-DE", emptyPresence()],
          [
            "fr-FR",
            {
              pushReady: false,
              hasExistingTranslation: true,
              importProvenanceOnly: false,
              contentHash: null,
            },
          ],
        ]),
    });

    expect(result.importedLocales).toEqual(["de-DE"]);
    expect(result.skippedLocales).toEqual(["fr-FR"]);
    expect(extractEntries).toHaveBeenCalledOnce();
  });

  it("does not import incomplete Intercom target copy", async () => {
    const result = await importIntercomTargetTranslations({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "intercom/help/getting-started.md",
      localeMapping,
      localeContent: {
        de: { title: "Hallo", description: "", body: "<p></p>" },
        fr: { title: "", description: "", body: "Bienvenue" },
      },
      policy: "seed_empty",
      extractEntries: async () => new Map(),
      loadPresence: async () => new Map(),
    });

    expect(result.importedLocales).toEqual([]);
    expect(replaceImageVariantBytesMock).not.toHaveBeenCalled();
  });

  it("counts extract failures per locale without writing translations", async () => {
    const result = await importIntercomTargetTranslations({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "intercom/help/getting-started.md",
      localeMapping,
      localeContent,
      policy: "seed_empty",
      extractEntries: async () => {
        throw new Error("sandbox_failed");
      },
      loadPresence: async () =>
        new Map([
          ["de-DE", emptyPresence()],
          ["fr-FR", emptyPresence()],
        ]),
    });

    expect(result.importedLocales).toEqual([]);
    expect(result.failedLocales).toEqual(["de-DE", "fr-FR"]);
    expect(replaceImageVariantBytesMock).not.toHaveBeenCalled();
  });
});
