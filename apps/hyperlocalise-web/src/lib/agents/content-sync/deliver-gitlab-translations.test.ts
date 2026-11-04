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
  hiddenKeyRows: vi.fn<() => { key: string }[]>(),
  loadPrefilled: vi.fn(),
  loadHtml: vi.fn(),
}));

vi.mock("@/lib/database/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => Promise.resolve(mocks.hiddenKeyRows()) }),
      }),
    }),
  },
  schema: {
    projectTranslationKeys: {
      key: "key",
      organizationId: "organizationId",
      projectId: "projectId",
      repositorySourceFileId: "repositorySourceFileId",
      isHidden: "isHidden",
    },
    repositorySourceFiles: { id: "id", sourcePath: "sourcePath" },
  },
}));
vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  loadProjectTranslationsAsPrefilledEntries: (...args: unknown[]) => mocks.loadPrefilled(...args),
}));
vi.mock("@/lib/projects/files/html-translation-download", () => ({
  loadProjectHtmlTranslationDownload: (...args: unknown[]) => mocks.loadHtml(...args),
}));
vi.mock("@/lib/log", async () => {
  const { createTestLogger } = await import("@/test/create-test-logger");
  return { createLogger: () => createTestLogger() };
});

import { err, isErr, isOk, ok } from "@/lib/primitives/result/results";

import { compileContentSyncPathTemplate } from "./content-sync-locale-paths";
import type {
  ContentSyncRepositoryReader,
  ContentSyncRepositoryWriter,
} from "./content-sync-provider";
import type { ContentSyncConfig } from "./content-sync-types";
import { deliverGitLabTranslations } from "./deliver-gitlab-translations";

const syncConfig: ContentSyncConfig = {
  provider: "gitlab",
  connectionId: "42",
  resourceKey: "acme/web",
  providerFolder: "locales",
  projectFolder: "gitlab/acme/web",
  pathTemplate: "{{locale}}.json",
};

const head = { branch: "main", commitSha: "abc" };

type Reader = {
  [K in keyof ContentSyncRepositoryReader]: ReturnType<
    typeof vi.fn<ContentSyncRepositoryReader[K]>
  >;
};

function fakeReader(input: { syncBranch?: string | null; files?: Record<string, string> }): Reader {
  const files = input.files ?? {};
  return {
    resolveBranchHead: vi.fn<ContentSyncRepositoryReader["resolveBranchHead"]>(
      async ({ branch }) =>
        branch === "main"
          ? ok(head)
          : input.syncBranch
            ? ok({ branch: branch ?? "", commitSha: input.syncBranch })
            : err({ code: "content_sync_branch_not_found", message: "none" }),
    ),
    listFiles: vi.fn<ContentSyncRepositoryReader["listFiles"]>(async () => ok([])),
    readFile: vi.fn<ContentSyncRepositoryReader["readFile"]>(async ({ path }) =>
      path in files
        ? ok(Buffer.from(files[path]!, "utf8"))
        : err({ code: "content_sync_file_not_found", message: "none" }),
    ),
  };
}

type Writer = {
  [K in keyof ContentSyncRepositoryWriter]: ReturnType<
    typeof vi.fn<ContentSyncRepositoryWriter[K]>
  >;
};

function fakeWriter(): Writer {
  return {
    commitFiles: vi.fn<ContentSyncRepositoryWriter["commitFiles"]>(async () =>
      ok({ commitSha: "def" }),
    ),
    upsertReview: vi.fn<ContentSyncRepositoryWriter["upsertReview"]>(async () =>
      ok({ id: "7", url: "https://gitlab.com/acme/web/-/merge_requests/7" }),
    ),
  };
}

function prefilled(byLocale: Record<string, Record<string, string>>, loadedKeyCount = 2) {
  mocks.loadPrefilled.mockImplementation(async ({ targetLocale }: { targetLocale: string }) => {
    const map = byLocale[targetLocale] ?? {};
    return {
      prefilled: map,
      retryKeys: [],
      truncated: false,
      loadedKeyCount,
      maxKeyCount: 5000,
      translatedKeyCount: Object.keys(map).length,
    };
  });
}

function deliver(input: {
  reader: ContentSyncRepositoryReader;
  writer: ContentSyncRepositoryWriter;
  targetLocales?: string[];
  localeCodes?: Map<string, string>;
  sourceFiles?: { relativePath: string; projectPath: string; content: Buffer }[];
  template?: string;
}) {
  return deliverGitLabTranslations({
    organizationId: "org-1",
    projectId: "project-1",
    runId: "run-12345678",
    syncConfig: { ...syncConfig, pathTemplate: input.template ?? syncConfig.pathTemplate },
    reader: input.reader,
    writer: input.writer,
    head,
    template: compileContentSyncPathTemplate(input.template ?? syncConfig.pathTemplate!),
    targetLocales: input.targetLocales ?? ["fr-FR", "de-DE"],
    localeCodes: input.localeCodes ?? new Map([["fr-FR", "fr"]]),
    sourceFiles: input.sourceFiles ?? [
      {
        relativePath: "en.json",
        projectPath: "gitlab/acme/web/en.json",
        content: Buffer.from('{\n  "title": "Home",\n  "nav": { "about": "About" }\n}\n', "utf8"),
      },
    ],
    branchName: "hyperlocalise/translations-sync-1",
  });
}

describe("deliverGitLabTranslations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hiddenKeyRows.mockReturnValue([]);
  });

  it("writes a language file in the repository's own code and shape, then opens the merge request", async () => {
    prefilled({ "fr-FR": { title: "Accueil" } });
    const writer = fakeWriter();

    const result = await deliver({ reader: fakeReader({}), writer });

    expect(isOk(result) && result.value).toEqual({
      written: 1,
      pullRequestUrl: "https://gitlab.com/acme/web/-/merge_requests/7",
      heldBack: 0,
      unsupported: 0,
    });
    expect(writer.commitFiles).toHaveBeenCalledWith({
      branch: "hyperlocalise/translations-sync-1",
      startFrom: head,
      message: "chore(i18n): update translations (run-1234)",
      changes: [
        {
          path: "locales/fr.json",
          content: Buffer.from('{\n  "title": "Accueil"\n}\n', "utf8"),
          exists: false,
        },
      ],
    });
    expect(writer.upsertReview).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceBranch: "hyperlocalise/translations-sync-1",
        targetBranch: "main",
      }),
    );
  });

  it("names a locale with no file yet by its project tag", async () => {
    prefilled({ "de-DE": { title: "Start" } });
    const writer = fakeWriter();

    await deliver({ reader: fakeReader({}), writer });

    const call = writer.commitFiles.mock.calls[0]![0] as { changes: { path: string }[] };
    expect(call.changes.map((change) => change.path)).toEqual(["locales/de-DE.json"]);
  });

  it("compares against the sync branch, leaves unchanged files out and touches no merge request when nothing changes", async () => {
    prefilled({ "fr-FR": { title: "Accueil" } });
    const writer = fakeWriter();
    const reader = fakeReader({
      syncBranch: "sync-head",
      files: { "locales/fr.json": '{\n  "title": "Accueil"\n}\n' },
    });

    const result = await deliver({ reader, writer });

    expect(isOk(result) && result.value).toEqual({ written: 0, heldBack: 0, unsupported: 0 });
    const { readFile } = reader;
    expect(readFile).toHaveBeenCalledWith({
      commitSha: "sync-head",
      path: "locales/fr.json",
    });
    expect(writer.commitFiles).not.toHaveBeenCalled();
    expect(writer.upsertReview).not.toHaveBeenCalled();
  });

  it("keeps the repository's text for a key that is back in review", async () => {
    prefilled({ "fr-FR": { title: "Accueil" } });
    const writer = fakeWriter();
    const reader = fakeReader({
      files: { "locales/fr.json": '{"title":"Vieux","nav":{"about":"À propos"}}' },
    });

    await deliver({ reader, writer });

    const call = writer.commitFiles.mock.calls[0]![0] as {
      changes: { content: Buffer; exists: boolean }[];
    };
    expect(JSON.parse(call.changes[0]!.content.toString("utf8"))).toEqual({
      title: "Accueil",
      nav: { about: "À propos" },
    });
    expect(call.changes[0]!.exists).toBe(true);
  });

  it("leaves out keys the repository dropped, even when approved", async () => {
    prefilled({ "fr-FR": { title: "Accueil", "nav.about": "À propos" } });
    mocks.hiddenKeyRows.mockReturnValue([{ key: "nav.about" }]);
    const writer = fakeWriter();

    await deliver({ reader: fakeReader({}), writer });

    const call = writer.commitFiles.mock.calls[0]![0] as { changes: { content: Buffer }[] };
    expect(JSON.parse(call.changes[0]!.content.toString("utf8"))).toEqual({ title: "Accueil" });
  });

  it("sends a page whole once every segment is approved, and holds it back before that", async () => {
    const page = {
      relativePath: "en/pricing.html",
      projectPath: "gitlab/acme/web/en/pricing.html",
      content: Buffer.from("<p>Hi</p>"),
    };
    prefilled({ "fr-FR": { s1: "Salut" } }, 2);
    const writer = fakeWriter();
    const held = await deliver({
      reader: fakeReader({}),
      writer,
      sourceFiles: [page],
      template: "{{locale}}/*.html",
      targetLocales: ["fr-FR"],
    });
    expect(isOk(held) && held.value).toEqual({ written: 0, heldBack: 1, unsupported: 0 });
    expect(mocks.loadHtml).not.toHaveBeenCalled();

    prefilled({ "fr-FR": { s1: "Salut", s2: "Prix" } }, 2);
    mocks.loadHtml.mockResolvedValue(
      ok({
        content: Buffer.from("<p>Salut</p>"),
        contentType: "text/html",
        extension: ".html",
        translatedKeyCount: 2,
      }),
    );
    const sent = await deliver({
      reader: fakeReader({}),
      writer,
      sourceFiles: [page],
      template: "{{locale}}/*.html",
      targetLocales: ["fr-FR"],
    });
    expect(isOk(sent) && sent.value.written).toBe(1);
    const call = writer.commitFiles.mock.calls[0]![0] as { changes: { path: string }[] };
    expect(call.changes[0]!.path).toBe("locales/fr/pricing.html");
  });

  it("counts formats it can't write back yet", async () => {
    prefilled({ "fr-FR": { a: "b" } });
    const result = await deliver({
      reader: fakeReader({}),
      writer: fakeWriter(),
      sourceFiles: [
        { relativePath: "en.po", projectPath: "gitlab/acme/web/en.po", content: Buffer.from("") },
      ],
      template: "{{locale}}.po",
    });
    expect(isOk(result) && result.value).toEqual({ written: 0, heldBack: 0, unsupported: 1 });
  });

  it("fails the run when the commit is refused", async () => {
    prefilled({ "fr-FR": { title: "Accueil" } });
    const writer = fakeWriter();
    writer.commitFiles.mockResolvedValue(
      err({ code: "content_sync_connection_required", message: "no write access" }),
    );

    const result = await deliver({ reader: fakeReader({}), writer });

    expect(isErr(result) && result.error).toEqual({
      code: "content_sync_push_failed",
      message: "no write access",
    });
  });
});
