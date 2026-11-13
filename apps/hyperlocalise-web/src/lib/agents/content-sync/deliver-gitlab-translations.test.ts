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
import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  keyRows: vi.fn<() => { key: string; isHidden: boolean; hiddenBySyncAt: Date | null }[]>(),
  loadPrefilled: vi.fn(),
  loadHtml: vi.fn(),
  applySourceText: vi.fn(),
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
      isHidden: "isHidden",
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
vi.mock("@/lib/projects/files/source-text-editing", async () => ({
  ...(await vi.importActual<typeof import("@/lib/projects/files/source-text-editing")>(
    "@/lib/projects/files/source-text-editing",
  )),
  applyProjectSourceText: (...args: unknown[]) => mocks.applySourceText(...args),
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
  ContentSyncReviewDetails,
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

const head = { branch: "main", commitSha: "abc", parentCommitShas: ["aaa"] };
const sourceEn = {
  relativePath: "en.json",
  projectPath: "gitlab/acme/web/en.json",
  content: Buffer.from('{\n  "title": "Home",\n  "nav": { "about": "About" }\n}\n', "utf8"),
};
const review = { id: "7", url: "https://gitlab.com/acme/web/-/merge_requests/7" };

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

function blobId(text: string) {
  const bytes = Buffer.from(text, "utf8");
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

/**
 * Files on the target at `head`, and a sync branch: its files, its parent and the paths its
 * commit touches.
 */
function fakeReader(input: {
  target?: Record<string, string>;
  syncBranch?: { files: Record<string, string>; parent?: string; commitPaths?: string[] };
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
            ? ok({
                branch: name ?? "",
                commitSha: "sync-head",
                parentCommitShas: [branch.parent ?? "abc"],
              })
            : err({ code: "content_sync_branch_not_found", message: "none" }),
    ),
    listFiles: vi.fn<ContentSyncRepositoryReader["listFiles"]>(async ({ commitSha }) =>
      ok(
        commitSha === "sync-head" && branch
          ? Object.entries(branch.files).map(([path, text]) => ({ path, contentId: blobId(text) }))
          : [],
      ),
    ),
    readFile: vi.fn<ContentSyncRepositoryReader["readFile"]>(async ({ commitSha, path }) =>
      commitSha === "sync-head" ? read(branch?.files ?? {}, path) : read(target, path),
    ),
    listCommitPaths: vi.fn<ContentSyncRepositoryReader["listCommitPaths"]>(async () =>
      ok(branch?.commitPaths ?? Object.keys(branch?.files ?? {})),
    ),
  };
}

function fakeWriter(
  existing:
    | (Partial<Pick<ContentSyncReviewDetails, "fingerprint" | "closedBySync">> & {
        state: ContentSyncReviewDetails["state"];
      })
    | null = null,
): Writer {
  return {
    commitFiles: vi.fn<ContentSyncRepositoryWriter["commitFiles"]>(async () =>
      ok({ commitSha: "def" }),
    ),
    upsertReview: vi.fn<ContentSyncRepositoryWriter["upsertReview"]>(async () => ok(review)),
    findReview: vi.fn<ContentSyncRepositoryWriter["findReview"]>(async () =>
      ok(
        existing
          ? {
              ...review,
              state: existing.state,
              fingerprint: existing.fingerprint ?? null,
              closedBySync: existing.closedBySync ?? false,
            }
          : null,
      ),
    ),
    closeReview: vi.fn<ContentSyncRepositoryWriter["closeReview"]>(async () => ok(undefined)),
    deleteBranch: vi.fn<ContentSyncRepositoryWriter["deleteBranch"]>(async () => ok(undefined)),
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
  sourceLocale?: string;
  targetLocales?: string[];
  localeCodes?: Map<string, string>;
  repositoryPaths?: string[];
  sourceFiles?: { relativePath: string; projectPath: string; content: Buffer }[];
  template?: string;
  sourceTextEditable?: boolean;
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
    sourceLocale: input.sourceLocale ?? "en-US",
    sourceTextEditable: input.sourceTextEditable ?? false,
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

const nothing = {
  written: 0,
  heldBack: 0,
  listsHeldBack: 0,
  unsupported: 0,
  unreadable: 0,
  conflicts: 0,
};

describe("deliverGitLabTranslations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.keyRows.mockReturnValue([
      { key: "title", isHidden: false, hiddenBySyncAt: null },
      { key: "nav.about", isHidden: false, hiddenBySyncAt: null },
    ]);
  });

  it("writes a language file in the repository's own code and shape, from the target, and opens the merge request", async () => {
    prefilled({ "fr-FR": { title: "Accueil" } });
    const writer = fakeWriter();

    const result = await deliver({ reader: fakeReader({}), writer });

    expect(result).toEqual({ ...nothing, written: 1, pullRequestUrl: review.url });
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

  it("names a locale with no file yet the way the repository names its regional codes, or by the bare language", async () => {
    prefilled({ "de-DE": { title: "Start" } });
    const underscores = fakeWriter();
    await deliver({
      reader: fakeReader({}),
      writer: underscores,
      localeCodes: new Map([
        ["en-US", "en_US"],
        ["fr-FR", "fr_FR"],
      ]),
    });
    expect(committedChanges(underscores).map((change) => change.path)).toEqual([
      "locales/de_DE.json",
    ]);

    const bare = fakeWriter();
    await deliver({ reader: fakeReader({}), writer: bare });
    // Only bare codes in the repository and one German locale: `de`, not `de-de`.
    expect(committedChanges(bare).map((change) => change.path)).toEqual(["locales/de.json"]);
  });

  it("reads only language files the listing has, compares with the target, and links the open merge request when nothing changes", async () => {
    prefilled({ "fr-FR": { title: "Accueil" } });
    const writer = fakeWriter({ state: "open" });
    const reader = fakeReader({ target: { "locales/fr.json": '{\n  "title": "Accueil"\n}\n' } });

    const result = await deliver({
      reader,
      writer,
      repositoryPaths: ["locales/en.json", "locales/fr.json"],
    });

    expect(result).toEqual({ ...nothing, pullRequestUrl: review.url });
    const { readFile } = reader;
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith({ commitSha: "abc", path: "locales/fr.json" });
    expect(writer.commitFiles).not.toHaveBeenCalled();
    expect(writer.upsertReview).not.toHaveBeenCalled();
  });

  it("rebuilds a branch whose commit touches more files than can be listed", async () => {
    prefilled({ "fr-FR": { title: "Accueil" } });
    const writer = fakeWriter({ state: "open" });
    const reader = fakeReader({ syncBranch: { files: { "locales/fr.json": "{}" } } });
    reader.listCommitPaths.mockResolvedValue(ok(null));

    await deliver({ reader, writer });

    expect(writer.commitFiles).toHaveBeenCalledTimes(1);
  });

  it("closes the open merge request when nothing approved differs any more but the branch still exists", async () => {
    prefilled({ "fr-FR": { title: "Accueil" } });
    const writer = fakeWriter({ state: "open" });
    const reader = fakeReader({
      target: { "locales/fr.json": '{\n  "title": "Accueil"\n}\n' },
      syncBranch: { files: { "locales/fr.json": '{\n  "title": "Vieux approuvé"\n}\n' } },
    });

    const result = await deliver({
      reader,
      writer,
      repositoryPaths: ["locales/en.json", "locales/fr.json"],
    });

    expect(result).toEqual(nothing);
    expect(writer.closeReview).toHaveBeenCalledWith({
      id: "7",
      reason: expect.stringMatching(/Closed by Hyperlocalise/),
    });
    expect(writer.deleteBranch).toHaveBeenCalledWith("hyperlocalise/translations-sync-1");
  });

  it("leaves the branch alone when it is one commit on the target holding exactly this change", async () => {
    prefilled({ "fr-FR": { title: "Accueil" } });
    const built = '{\n  "title": "Accueil"\n}\n';
    const reader = fakeReader({
      target: { "locales/fr.json": '{\n  "title": "Vieux"\n}\n' },
      syncBranch: { files: { "locales/fr.json": built }, parent: "abc" },
    });

    const open = fakeWriter({ state: "open" });
    const kept = await deliver({
      reader,
      writer: open,
      repositoryPaths: ["locales/en.json", "locales/fr.json"],
    });
    expect(kept).toEqual({ ...nothing, pullRequestUrl: review.url });
    expect(open.commitFiles).not.toHaveBeenCalled();
    expect(open.upsertReview).toHaveBeenCalledTimes(1);

    // Once the merge request carries this content's fingerprint, a run with nothing new leaves
    // it untouched: no edit, no note, just the link.
    const fingerprint = (open.upsertReview.mock.calls[0]![0] as { fingerprint: string })
      .fingerprint;
    const current = fakeWriter({ state: "open", fingerprint });
    const untouched = await deliver({
      reader,
      writer: current,
      repositoryPaths: ["locales/en.json", "locales/fr.json"],
    });
    expect(untouched).toEqual({ ...nothing, pullRequestUrl: review.url });
    expect(current.commitFiles).not.toHaveBeenCalled();
    expect(current.upsertReview).not.toHaveBeenCalled();

    // A merge request a reviewer closed on exactly this content stays closed, whatever the branch;
    // one closed on other content, or by the sync itself, does not hold the next one back.
    const closed = fakeWriter({ state: "closed", fingerprint });
    const left = await deliver({
      reader: fakeReader({ target: { "locales/fr.json": '{\n  "title": "Vieux"\n}\n' } }),
      writer: closed,
      repositoryPaths: ["locales/en.json", "locales/fr.json"],
    });
    expect(left).toEqual(nothing);
    expect(closed.commitFiles).not.toHaveBeenCalled();
    expect(closed.upsertReview).not.toHaveBeenCalled();

    const otherContent = fakeWriter({ state: "closed", fingerprint: "other" });
    await deliver({
      reader,
      writer: otherContent,
      repositoryPaths: ["locales/en.json", "locales/fr.json"],
    });
    expect(otherContent.upsertReview).toHaveBeenCalledTimes(1);

    const bySync = fakeWriter({ state: "closed", fingerprint, closedBySync: true });
    await deliver({
      reader,
      writer: bySync,
      repositoryPaths: ["locales/en.json", "locales/fr.json"],
    });
    expect(bySync.upsertReview).toHaveBeenCalledTimes(1);

    const none = fakeWriter();
    const opened = await deliver({
      reader,
      writer: none,
      repositoryPaths: ["locales/en.json", "locales/fr.json"],
    });
    expect(opened.pullRequestUrl).toBe(review.url);
    expect(none.commitFiles).not.toHaveBeenCalled();
    expect(none.upsertReview).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the branch when it sits on an older target or changes other files too", async () => {
    prefilled({ "fr-FR": { title: "Accueil" } });
    const built = '{\n  "title": "Accueil"\n}\n';
    const paths = ["locales/en.json", "locales/fr.json"];

    const stale = fakeWriter({ state: "open" });
    await deliver({
      reader: fakeReader({
        target: { "locales/fr.json": '{\n  "title": "Vieux"\n}\n' },
        syncBranch: { files: { "locales/fr.json": built }, parent: "older" },
      }),
      writer: stale,
      repositoryPaths: paths,
    });
    expect(stale.commitFiles).toHaveBeenCalledTimes(1);

    const extra = fakeWriter({ state: "open" });
    await deliver({
      reader: fakeReader({
        target: { "locales/fr.json": '{\n  "title": "Vieux"\n}\n' },
        syncBranch: {
          files: { "locales/fr.json": built, "locales/de.json": "{}" },
          commitPaths: ["locales/fr.json", "locales/de.json"],
        },
      }),
      writer: extra,
      repositoryPaths: paths,
    });
    expect(extra.commitFiles).toHaveBeenCalledTimes(1);
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
      { key: "title", isHidden: false, hiddenBySyncAt: null },
      { key: "nav.about", isHidden: true, hiddenBySyncAt: new Date() },
    ]);
    const writer = fakeWriter();

    await deliver({ reader: fakeReader({}), writer });

    expect(JSON.parse(committedChanges(writer)[0]!.content!)).toEqual({ title: "Accueil" });
  });

  it("never sends the approved text of a key hidden by hand, and counts a same-language target that would overwrite the source", async () => {
    prefilled({ "fr-FR": { title: "Accueil", "nav.about": "À propos" } });
    mocks.keyRows.mockReturnValue([
      { key: "title", isHidden: false, hiddenBySyncAt: null },
      { key: "nav.about", isHidden: true, hiddenBySyncAt: null },
    ]);
    const writer = fakeWriter();
    await deliver({ reader: fakeReader({}), writer, targetLocales: ["fr-FR"] });
    expect(JSON.parse(committedChanges(writer)[0]!.content!)).toEqual({
      title: "Accueil",
      nav: { about: "About" },
    });

    prefilled({ "en-GB": { title: "Home (UK)" } });
    const conflict = fakeWriter();
    const result = await deliver({
      reader: fakeReader({}),
      writer: conflict,
      sourceLocale: "en",
      targetLocales: ["en-GB"],
      // The repository names both as `en`, so the target's file is the source file.
      localeCodes: new Map([
        ["en", "en"],
        ["en-GB", "en"],
      ]),
    });
    expect(result).toEqual({ ...nothing, conflicts: 1 });
    expect(conflict.commitFiles).not.toHaveBeenCalled();
  });

  it("sends a page whole once every segment that is text to translate is approved", async () => {
    const page = {
      relativePath: "en/pricing.html",
      projectPath: "gitlab/acme/web/en/pricing.html",
      content: Buffer.from("<p>Hi</p>"),
    };
    mocks.keyRows.mockReturnValue([
      { key: "s1", isHidden: false, hiddenBySyncAt: null },
      { key: "s2", isHidden: false, hiddenBySyncAt: null },
      { key: "s3", isHidden: true, hiddenBySyncAt: null },
    ]);
    const pageInput = {
      sourceFiles: [page],
      template: "{{locale}}/*.html",
      targetLocales: ["fr-FR"],
      repositoryPaths: ["locales/en/pricing.html"],
    };
    prefilled({ "fr-FR": { s1: "Salut" } }, 3);
    const held = await deliver({ reader: fakeReader({}), writer: fakeWriter(), ...pageInput });
    expect(held).toEqual({ ...nothing, heldBack: 1 });
    expect(mocks.loadHtml).not.toHaveBeenCalled();

    // An open merge request from an earlier run is closed with the reason the page waits now.
    const stale = fakeWriter({ state: "open" });
    await deliver({
      reader: fakeReader({ syncBranch: { files: { "locales/fr/pricing.html": "<p>Salut</p>" } } }),
      writer: stale,
      ...pageInput,
    });
    expect(stale.closeReview).toHaveBeenCalledWith({
      id: "7",
      reason: expect.stringMatching(/waiting for approval/),
    });

    // Two of three approved, the third hidden by hand: nothing more to wait for.
    prefilled({ "fr-FR": { s1: "Salut", s2: "Prix" } }, 3);
    mocks.loadHtml.mockResolvedValue(
      ok({
        content: Buffer.from("<p>Salut</p>"),
        contentType: "text/html",
        extension: ".html",
        translatedKeyCount: 2,
      }),
    );
    const writer = fakeWriter();
    const sent = await deliver({ reader: fakeReader({}), writer, ...pageInput });
    expect(sent.written).toBe(1);
    expect(committedChanges(writer)[0]!.path).toBe("locales/fr/pricing.html");
    // The hidden segment is left as the source has it, approved text or not.
    expect(mocks.loadHtml).toHaveBeenCalledWith(
      expect.objectContaining({ approvedTranslationsOnly: true, omitKeys: new Set(["s3"]) }),
    );
  });

  describe("with source text editable in the project", () => {
    const editedEn = Buffer.from('{\n  "title": "Welcome",\n  "nav": { "about": "About" }\n}\n');

    it("writes the project's source text into the source file in the same merge request", async () => {
      mocks.applySourceText.mockResolvedValue({ content: editedEn, written: ["title"] });
      prefilled({ "fr-FR": { title: "Accueil" } });
      const writer = fakeWriter();

      const result = await deliver({ reader: fakeReader({}), writer, sourceTextEditable: true });

      expect(result).toEqual({
        ...nothing,
        written: 1,
        sourceWritten: 1,
        pullRequestUrl: review.url,
      });
      expect(committedChanges(writer)).toEqual([
        { path: "locales/en.json", content: editedEn.toString("utf8"), exists: true },
        { path: "locales/fr.json", content: '{\n  "title": "Accueil"\n}\n', exists: false },
      ]);
      expect(mocks.applySourceText).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-1",
          projectId: "project-1",
          sourcePath: "gitlab/acme/web/en.json",
          content: sourceEn.content,
        }),
      );
      expect(writer.commitFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "chore(i18n): update source text and translations (run-1234)",
        }),
      );
      // The title stays as it was, since an open merge request keeps its title.
      expect(writer.upsertReview).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "chore(i18n): update translations",
          description: expect.stringContaining("**This merge request also changes source text:**"),
        }),
      );
    });

    it("sends source text alone in a project with no target languages", async () => {
      mocks.applySourceText.mockResolvedValue({ content: editedEn, written: ["title"] });
      prefilled({});
      const writer = fakeWriter();

      const result = await deliver({
        reader: fakeReader({}),
        writer,
        sourceTextEditable: true,
        targetLocales: [],
      });

      expect(result).toEqual({ ...nothing, sourceWritten: 1, pullRequestUrl: review.url });
      expect(committedChanges(writer).map((change) => change.path)).toEqual(["locales/en.json"]);
    });

    it("writes no source file while the setting is off, or for a page", async () => {
      prefilled({ "fr-FR": { title: "Accueil" } });
      const off = fakeWriter();
      await deliver({ reader: fakeReader({}), writer: off });
      expect(committedChanges(off).map((change) => change.path)).toEqual(["locales/fr.json"]);
      expect(mocks.applySourceText).not.toHaveBeenCalled();

      mocks.keyRows.mockReturnValue([{ key: "s1", isHidden: false, hiddenBySyncAt: null }]);
      prefilled({}, 1);
      await deliver({
        reader: fakeReader({}),
        writer: fakeWriter(),
        sourceFiles: [
          {
            relativePath: "en/pricing.html",
            projectPath: "gitlab/acme/web/en/pricing.html",
            content: Buffer.from("<p>Hi</p>"),
          },
        ],
        template: "{{locale}}/*.html",
        targetLocales: [],
        repositoryPaths: ["locales/en/pricing.html"],
        sourceTextEditable: true,
      });
      expect(mocks.applySourceText).not.toHaveBeenCalled();
    });

    it("closes an open merge request when there is nothing left to send and no target languages", async () => {
      prefilled({});
      const writer = fakeWriter({ state: "open" });
      await deliver({
        reader: fakeReader({ syncBranch: { files: { "locales/en.json": "{}" } } }),
        writer,
        targetLocales: [],
      });
      expect(writer.closeReview).toHaveBeenCalled();
    });
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
    // en.po: unsupported; en.json and en-US.json both name fr.json: two conflicts.
    expect(result).toEqual({ ...nothing, unsupported: 1, conflicts: 2 });
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
      ...nothing,
      error: { code: "content_sync_connection_required", message: "no write access" },
    });
  });
});
