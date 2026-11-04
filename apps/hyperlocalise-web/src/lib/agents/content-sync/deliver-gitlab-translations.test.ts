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
  keyRows: vi.fn<() => { key: string; hiddenBySyncAt: Date | null }[]>(),
  loadPrefilled: vi.fn(),
  loadHtml: vi.fn(),
}));

vi.mock("@/lib/database/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => Promise.resolve(mocks.keyRows()) }),
      }),
    }),
  },
  schema: {
    projectTranslationKeys: {
      key: "key",
      hiddenBySyncAt: "hiddenBySyncAt",
      organizationId: "organizationId",
      projectId: "projectId",
      repositorySourceFileId: "repositorySourceFileId",
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

import { err, ok, type Result } from "@/lib/primitives/result/results";

import { compileContentSyncPathTemplate } from "./content-sync-locale-paths";
import type {
  ContentSyncProviderError,
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
const sourceEn = {
  relativePath: "en.json",
  projectPath: "gitlab/acme/web/en.json",
  content: Buffer.from('{\n  "title": "Home",\n  "nav": { "about": "About" }\n}\n', "utf8"),
};

type Reader = {
  [K in keyof ContentSyncRepositoryReader]: ReturnType<
    typeof vi.fn<ContentSyncRepositoryReader[K]>
  >;
};
type Writer = {
  [K in keyof ContentSyncRepositoryWriter]: ReturnType<
    typeof vi.fn<ContentSyncRepositoryWriter[K]>
  >;
};

/** Files on the target at `head`, and on the sync branch when it exists. */
function fakeReader(input: {
  target?: Record<string, string>;
  syncBranch?: Record<string, string>;
}): Reader {
  const target = input.target ?? {};
  const branch = input.syncBranch;
  const read = (
    files: Record<string, string>,
    path: string,
  ): Result<Buffer, ContentSyncProviderError> =>
    path in files
      ? ok(Buffer.from(files[path]!, "utf8"))
      : err({ code: "content_sync_file_not_found", message: "none" });
  return {
    resolveBranchHead: vi.fn<ContentSyncRepositoryReader["resolveBranchHead"]>(
      async ({ branch: name }) =>
        name === "main"
          ? ok(head)
          : branch
            ? ok({ branch: name ?? "", commitSha: "sync-head" })
            : err({ code: "content_sync_branch_not_found", message: "none" }),
    ),
    listFiles: vi.fn<ContentSyncRepositoryReader["listFiles"]>(async () => ok([])),
    readFile: vi.fn<ContentSyncRepositoryReader["readFile"]>(async ({ commitSha, path }) =>
      commitSha === "sync-head" ? read(branch ?? {}, path) : read(target, path),
    ),
  };
}

function fakeWriter(openReview = false): Writer {
  const review = { id: "7", url: "https://gitlab.com/acme/web/-/merge_requests/7" };
  return {
    commitFiles: vi.fn<ContentSyncRepositoryWriter["commitFiles"]>(async () =>
      ok({ commitSha: "def" }),
    ),
    upsertReview: vi.fn<ContentSyncRepositoryWriter["upsertReview"]>(async () => ok(review)),
    findOpenReview: vi.fn<ContentSyncRepositoryWriter["findOpenReview"]>(async () =>
      ok(openReview ? review : null),
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
  reader: Reader;
  writer: Writer;
  targetLocales?: string[];
  localeCodes?: Map<string, string>;
  repositoryPaths?: string[];
  sourceFiles?: { relativePath: string; projectPath: string; content: Buffer }[];
  template?: string;
}) {
  const template = input.template ?? syncConfig.pathTemplate!;
  return deliverGitLabTranslations({
    organizationId: "org-1",
    projectId: "project-1",
    runId: "run-12345678",
    syncConfig: { ...syncConfig, pathTemplate: template },
    reader: input.reader,
    writer: input.writer,
    head,
    template: compileContentSyncPathTemplate(template),
    targetLocales: input.targetLocales ?? ["fr-FR", "de-DE"],
    localeCodes:
      input.localeCodes ??
      new Map([
        ["en-US", "en"],
        ["fr-FR", "fr"],
      ]),
    repositoryPaths: new Set(input.repositoryPaths ?? ["locales/en.json"]),
    sourceFiles: input.sourceFiles ?? [sourceEn],
    branchName: "hyperlocalise/translations-sync-1",
  });
}

function committedChanges(writer: Writer) {
  const call = writer.commitFiles.mock.calls[0]?.[0];
  return (call?.changes ?? []).map((change) => ({
    path: change.path,
    content: "content" in change ? change.content.toString("utf8") : null,
    exists: "exists" in change ? change.exists : undefined,
  }));
}

describe("deliverGitLabTranslations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.keyRows.mockReturnValue([
      { key: "title", hiddenBySyncAt: null },
      { key: "nav.about", hiddenBySyncAt: null },
    ]);
  });

  it("writes a language file in the repository's own code and shape, from the target, and opens the merge request", async () => {
    prefilled({ "fr-FR": { title: "Accueil" } });
    const writer = fakeWriter();

    const result = await deliver({ reader: fakeReader({}), writer });

    expect(result).toEqual({
      written: 1,
      pullRequestUrl: "https://gitlab.com/acme/web/-/merge_requests/7",
      heldBack: 0,
      unsupported: 0,
      unreadable: 0,
    });
    expect(writer.commitFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "hyperlocalise/translations-sync-1",
        startFrom: head,
        message: "chore(i18n): update translations (run-1234)",
      }),
    );
    expect(committedChanges(writer)).toEqual([
      { path: "locales/fr.json", content: '{\n  "title": "Accueil"\n}\n', exists: false },
    ]);
    expect(writer.upsertReview).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceBranch: "hyperlocalise/translations-sync-1",
        targetBranch: "main",
      }),
    );
  });

  it("names a locale with no file yet the way the repository names its codes", async () => {
    prefilled({ "de-DE": { title: "Start" } });
    const writer = fakeWriter();

    await deliver({
      reader: fakeReader({}),
      writer,
      localeCodes: new Map([
        ["en-US", "en_us"],
        ["fr-FR", "fr_fr"],
      ]),
    });

    expect(committedChanges(writer).map((change) => change.path)).toEqual(["locales/de_de.json"]);
  });

  it("reads only language files the listing has, compares with the target, and links the open merge request when nothing changes", async () => {
    prefilled({ "fr-FR": { title: "Accueil" } });
    const writer = fakeWriter(true);
    const reader = fakeReader({ target: { "locales/fr.json": '{\n  "title": "Accueil"\n}\n' } });

    const result = await deliver({
      reader,
      writer,
      repositoryPaths: ["locales/en.json", "locales/fr.json"],
    });

    expect(result).toEqual({
      written: 0,
      pullRequestUrl: "https://gitlab.com/acme/web/-/merge_requests/7",
      heldBack: 0,
      unsupported: 0,
      unreadable: 0,
    });
    const { readFile } = reader;
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith({ commitSha: "abc", path: "locales/fr.json" });
    expect(writer.commitFiles).not.toHaveBeenCalled();
    expect(writer.upsertReview).not.toHaveBeenCalled();
  });

  it("leaves the branch alone when it already holds exactly this change, but still makes sure a merge request is open", async () => {
    prefilled({ "fr-FR": { title: "Accueil" } });
    const writer = fakeWriter();
    const reader = fakeReader({
      target: { "locales/fr.json": '{\n  "title": "Vieux"\n}\n' },
      syncBranch: { "locales/fr.json": '{\n  "title": "Accueil"\n}\n' },
    });

    const result = await deliver({
      reader,
      writer,
      repositoryPaths: ["locales/en.json", "locales/fr.json"],
    });

    expect(result.written).toBe(0);
    expect(result.pullRequestUrl).toBe("https://gitlab.com/acme/web/-/merge_requests/7");
    expect(writer.commitFiles).not.toHaveBeenCalled();
    expect(writer.upsertReview).toHaveBeenCalledTimes(1);
  });

  it("keeps the repository's text for a key that is back in review, and updates an existing file", async () => {
    prefilled({ "fr-FR": { title: "Accueil" } });
    const writer = fakeWriter();
    const reader = fakeReader({
      target: { "locales/fr.json": '{"title":"Vieux","nav":{"about":"À propos"}}' },
    });

    await deliver({ reader, writer, repositoryPaths: ["locales/en.json", "locales/fr.json"] });

    const [change] = committedChanges(writer);
    expect(JSON.parse(change!.content!)).toEqual({ title: "Accueil", nav: { about: "À propos" } });
    expect(change!.exists).toBe(true);
  });

  it("leaves out keys the sync hid because the repository dropped them, even when approved", async () => {
    prefilled({ "fr-FR": { title: "Accueil", "nav.about": "À propos" } });
    mocks.keyRows.mockReturnValue([
      { key: "title", hiddenBySyncAt: null },
      { key: "nav.about", hiddenBySyncAt: new Date() },
    ]);
    const writer = fakeWriter();

    await deliver({ reader: fakeReader({}), writer });

    expect(JSON.parse(committedChanges(writer)[0]!.content!)).toEqual({ title: "Accueil" });
  });

  it("sends a page whole once every segment is approved, and holds it back before that", async () => {
    const page = {
      relativePath: "en/pricing.html",
      projectPath: "gitlab/acme/web/en/pricing.html",
      content: Buffer.from("<p>Hi</p>"),
    };
    mocks.keyRows.mockReturnValue([
      { key: "s1", hiddenBySyncAt: null },
      { key: "s2", hiddenBySyncAt: null },
    ]);
    prefilled({ "fr-FR": { s1: "Salut" } }, 2);
    const writer = fakeWriter();
    const held = await deliver({
      reader: fakeReader({}),
      writer,
      sourceFiles: [page],
      template: "{{locale}}/*.html",
      targetLocales: ["fr-FR"],
      repositoryPaths: ["locales/en/pricing.html"],
    });
    expect(held).toEqual({ written: 0, heldBack: 1, unsupported: 0, unreadable: 0 });
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
      repositoryPaths: ["locales/en/pricing.html"],
    });
    expect(sent.written).toBe(1);
    expect(committedChanges(writer)[0]!.path).toBe("locales/fr/pricing.html");
  });

  it("counts what it can't send: unsupported formats, unreadable files and two sources naming one file", async () => {
    prefilled({ "fr-FR": { a: "b", title: "Accueil" } });
    const writer = fakeWriter();
    const result = await deliver({
      reader: fakeReader({ target: { "locales/fr.json": "{not json" } }),
      writer,
      sourceFiles: [
        { relativePath: "en.po", projectPath: "gitlab/acme/web/en.po", content: Buffer.from("") },
        sourceEn,
        { ...sourceEn, relativePath: "en-US.json", projectPath: "gitlab/acme/web/en-US.json" },
      ],
      targetLocales: ["fr-FR"],
      repositoryPaths: ["locales/en.json", "locales/fr.json"],
      template: "{{locale}}.*",
    });
    // en.po: unsupported; en.json and en-US.json both name fr.json: two unreadable.
    expect(result).toEqual({ written: 0, heldBack: 0, unsupported: 1, unreadable: 2 });
    expect(writer.commitFiles).not.toHaveBeenCalled();
  });

  it("reports a refused write on the run instead of failing it", async () => {
    prefilled({ "fr-FR": { title: "Accueil" } });
    const writer = fakeWriter();
    writer.commitFiles.mockResolvedValue(
      err({ code: "content_sync_connection_required", message: "no write access" }),
    );

    const result = await deliver({ reader: fakeReader({}), writer });

    expect(result).toEqual({
      written: 0,
      heldBack: 0,
      unsupported: 0,
      unreadable: 0,
      error: { code: "content_sync_connection_required", message: "no write access" },
    });
  });
});
