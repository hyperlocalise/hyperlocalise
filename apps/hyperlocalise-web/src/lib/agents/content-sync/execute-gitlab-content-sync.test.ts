import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { err, isErr, isOk, ok } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  projectRows: vi.fn(),
  reportRows: vi.fn(),
  markReportsShown: vi.fn(async (_condition: unknown) => undefined),
  storeRepositorySourceFile: vi.fn(),
  waitForSourceFileVersionIngest: vi.fn(),
  enqueueSourceFileIngestAfterUpload: vi.fn(),
  hideKeysMissingFromSync: vi.fn(),
  syncedFileRows: vi.fn(),
  versionRows: vi.fn(),
  unhideKeysSyncHid: vi.fn(),
  resolveGitLabAccess: vi.fn(),
  getGitLabProject: vi.fn(),
  createGitLabContentSyncReader: vi.fn(),
}));

vi.mock("@/lib/database/client", () => {
  const tables = {
    projects: {
      id: "id",
      organizationId: "organizationId",
    },
    repositorySourceFileVersions: {
      id: "id",
      syncReport: "syncReport",
      uploadSurface: "uploadSurface",
      ingestState: "ingestState",
      ingestWorkflowRunId: "ingestWorkflowRunId",
      repositorySourceFileId: "repositorySourceFileId",
    },
    repositorySourceFiles: {
      id: "id",
      organizationId: "organizationId",
      projectId: "projectId",
      sourcePath: "sourcePath",
      reconciledSourceFileVersionId: "reconciledSourceFileVersionId",
    },
  };
  // Each table answers from its own mock: `.limit()` for single rows, awaited for lists.
  const answer = (rows: () => unknown[], single: () => unknown[]) =>
    Object.assign(Promise.resolve(rows()), { limit: () => Promise.resolve(single()) });
  const from = (table: unknown) => {
    if (table === tables.projects) {
      return { where: () => answer(mocks.projectRows, mocks.projectRows) };
    }
    if (table === tables.repositorySourceFileVersions) {
      return { where: () => answer(mocks.reportRows, mocks.versionRows) };
    }
    return {
      innerJoin: () => ({ where: () => answer(mocks.syncedFileRows, mocks.syncedFileRows) }),
    };
  };
  // The only write is the "report shown" marker; the test reads which versions it marked.
  const update = () => ({
    set: () => ({ where: (condition: unknown) => mocks.markReportsShown(condition) }),
  });
  return { db: { select: () => ({ from }), update }, schema: tables };
});
vi.mock("@/lib/file-storage/upload-repository-source-files", () => ({
  storeRepositorySourceFile: (...args: unknown[]) => mocks.storeRepositorySourceFile(...args),
}));
vi.mock("@/lib/projects/files/source-file-ingest", () => ({
  enqueueSourceFileIngestAfterUpload: (...args: unknown[]) =>
    mocks.enqueueSourceFileIngestAfterUpload(...args),
}));
vi.mock("@/lib/projects/files/hide-keys-missing-from-sync", () => ({
  hideKeysMissingFromSync: (...args: unknown[]) => mocks.hideKeysMissingFromSync(...args),
  unhideKeysSyncHid: (...args: unknown[]) => mocks.unhideKeysSyncHid(...args),
}));
vi.mock("@/lib/intercom/wait-for-source-file-ingest", () => ({
  waitForSourceFileVersionIngest: (...args: unknown[]) =>
    mocks.waitForSourceFileVersionIngest(...args),
}));
vi.mock("@/lib/gitlab/access", () => ({
  resolveGitLabAccess: (...args: unknown[]) => mocks.resolveGitLabAccess(...args),
}));
vi.mock("@/lib/gitlab/client", () => ({
  getGitLabProject: (...args: unknown[]) => mocks.getGitLabProject(...args),
}));
vi.mock("@/lib/gitlab/content-sync-reader", () => ({
  createGitLabContentSyncReader: (...args: unknown[]) =>
    mocks.createGitLabContentSyncReader(...args),
}));
vi.mock("@/lib/log", async () => {
  const { createTestLogger } = await import("@/test/create-test-logger");
  return { createLogger: () => createTestLogger() };
});

import type { ContentSyncRepositoryReader } from "./content-sync-provider";
import type { ContentSyncConfig } from "./content-sync-types";
import { executeGitLabContentSync } from "./execute-gitlab-content-sync";

const syncConfig: ContentSyncConfig = {
  provider: "gitlab",
  connectionId: "42",
  resourceKey: "acme/web",
  providerFolder: "locales",
  projectFolder: "gitlab/acme/web",
  pathTemplate: "{{locale}}.json",
};

const files = new Map<string, string>([
  ["locales/en.json", '{"title":"Home"}'],
  ["locales/fr.json", '{"title":"Accueil"}'],
  ["locales/es.json", '{"title":"Inicio"}'],
  ["locales/README.md", "# Locales"],
  ["locales/en.txt", "notes"],
]);

type Reader = {
  [K in keyof ContentSyncRepositoryReader]: ReturnType<
    typeof vi.fn<ContentSyncRepositoryReader[K]>
  >;
};

function fakeReader(overrides: Partial<ContentSyncRepositoryReader> = {}): Reader {
  const reader: Reader = {
    resolveBranchHead: vi.fn<ContentSyncRepositoryReader["resolveBranchHead"]>(async ({ branch }) =>
      ok({ branch: branch || "main", commitSha: "abc" }),
    ),
    listFiles: vi.fn<ContentSyncRepositoryReader["listFiles"]>(async () =>
      ok([...files.keys()].map((path) => ({ path, contentId: null }))),
    ),
    readFile: vi.fn<ContentSyncRepositoryReader["readFile"]>(async ({ path }) =>
      ok(Buffer.from(files.get(path) ?? "", "utf8")),
    ),
  };
  for (const [name, override] of Object.entries(overrides)) {
    reader[name as keyof Reader].mockImplementation(override as never);
  }
  return reader;
}

function run(reader: ContentSyncRepositoryReader | undefined, config = syncConfig) {
  return executeGitLabContentSync({
    organizationId: "org-1",
    projectId: "project-1",
    automationId: "workflow-1",
    runId: "run-1",
    syncConfig: config,
    reader,
  });
}

describe("executeGitLabContentSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectRows.mockReturnValue([{ sourceLocale: "en-US", targetLocales: ["fr-FR"] }]);
    mocks.reportRows.mockReturnValue([]);
    mocks.storeRepositorySourceFile.mockImplementation(async (input: { sourcePath: string }) => ({
      path: input.sourcePath,
      outcome: "uploaded",
      fileId: "file-1",
      sourceFileVersionId: `version:${input.sourcePath}`,
    }));
    mocks.waitForSourceFileVersionIngest.mockResolvedValue("ingested");
    mocks.syncedFileRows.mockReturnValue([]);
    mocks.hideKeysMissingFromSync.mockResolvedValue([]);
    mocks.unhideKeysSyncHid.mockResolvedValue(undefined);
    mocks.versionRows.mockReturnValue([]);
    mocks.enqueueSourceFileIngestAfterUpload.mockResolvedValue({ workflowRunIds: ["wf-retry"] });
  });

  it("imports only the source locale's matching files and waits for their ingest", async () => {
    const reader = fakeReader();
    mocks.reportRows.mockReturnValue([
      {
        id: "version:gitlab/acme/web/en.json",
        syncReport: { missingKeys: ["old"] },
      },
    ]);

    const result = await run(reader);

    expect(isOk(result) && result.value).toEqual({
      pulled: {
        uploaded: 1,
        skipped: 0,
        failed: 0,
        unmatched: 3,
        translationFiles: 1,
        commitSha: "abc",
        files: [{ path: "gitlab/acme/web/en.json", missingKeys: ["old"] }],
      },
      pushed: { written: 0 },
    });
    const { readFile } = reader;
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith({ commitSha: "abc", path: "locales/en.json" });
    expect(mocks.storeRepositorySourceFile).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "gitlab/acme/web/en.json",
      content: Buffer.from('{"title":"Home"}', "utf8"),
      commitSha: "abc",
      workflowRunId: "run-1",
      uploadSurface: "gitlab_content_sync",
      skipUnchanged: "content",
    });
    expect(mocks.waitForSourceFileVersionIngest).toHaveBeenCalledWith({
      organizationId: "org-1",
      sourceFileVersionId: "version:gitlab/acme/web/en.json",
      timeoutMs: 120_000,
    });
  });

  it("waits for an unchanged file's earlier ingest too, queueing it again when it stalled", async () => {
    const skipped = {
      path: "gitlab/acme/web/en.json",
      outcome: "skipped",
      reason: "unchanged",
      sourceFileVersionId: "version:old",
      storedFileId: "stored:old",
    };
    const versionRow = (ingestState: string, ingestWorkflowRunId: string | null = "wf-old") => [
      { ingestState, ingestWorkflowRunId, repositorySourceFileId: "file:en" },
    ];
    mocks.storeRepositorySourceFile.mockResolvedValueOnce(skipped);
    mocks.versionRows.mockReturnValueOnce(versionRow("ingested"));
    const unchanged = await run(fakeReader());
    expect(isOk(unchanged) && unchanged.value.pulled).toMatchObject({
      uploaded: 0,
      skipped: 1,
      files: [],
    });
    expect(mocks.storeRepositorySourceFile).toHaveBeenCalledWith(
      expect.objectContaining({ skipUnchanged: "content" }),
    );
    expect(mocks.waitForSourceFileVersionIngest).toHaveBeenCalledWith(
      expect.objectContaining({ sourceFileVersionId: "version:old" }),
    );
    expect(mocks.enqueueSourceFileIngestAfterUpload).not.toHaveBeenCalled();
    // Keys an earlier run hid while the repository lacked the file come back without an ingest.
    expect(mocks.unhideKeysSyncHid).toHaveBeenCalledWith(expect.anything(), {
      repositorySourceFileId: "file:en",
      sourceFileVersionId: "version:old",
    });

    // A failed ingest is queued again; the waiter runs once a run has claimed the version.
    mocks.storeRepositorySourceFile.mockResolvedValueOnce(skipped);
    mocks.versionRows
      .mockReturnValueOnce(versionRow("failed"))
      .mockReturnValueOnce(versionRow("failed"))
      .mockReturnValueOnce(versionRow("ingesting", "wf-other"));
    const retried = await run(fakeReader());
    expect(isOk(retried)).toBe(true);
    expect(mocks.enqueueSourceFileIngestAfterUpload).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "project-1",
      storedFileId: "stored:old",
      sourceFileVersionId: "version:old",
      sourcePath: "gitlab/acme/web/en.json",
    });
    expect(mocks.waitForSourceFileVersionIngest).toHaveBeenCalledTimes(2);

    // A queued run that fails at once is seen by its run id, not mistaken for a stall.
    mocks.storeRepositorySourceFile.mockResolvedValueOnce(skipped);
    mocks.versionRows
      .mockReturnValueOnce(versionRow("pending", null))
      .mockReturnValueOnce(versionRow("failed", "wf-retry"));
    mocks.waitForSourceFileVersionIngest.mockResolvedValueOnce("failed");
    const failedFast = await run(fakeReader());
    expect(isErr(failedFast) && failedFast.error.message).toContain("failed. Check the file");

    mocks.storeRepositorySourceFile.mockResolvedValueOnce(skipped);
    mocks.versionRows.mockReturnValueOnce(versionRow("failed"));
    mocks.enqueueSourceFileIngestAfterUpload.mockRejectedValueOnce(new Error("queue down"));
    const notQueued = await run(fakeReader());
    expect(isErr(notQueued) && notQueued.error.message).toContain("could not be queued");

    mocks.waitForSourceFileVersionIngest.mockResolvedValueOnce("skipped");
    const superseded = await run(fakeReader());
    expect(isOk(superseded) && superseded.value.pulled).toMatchObject({ uploaded: 1 });
  });

  it("does not repeat the stored report of an unchanged file it skipped", async () => {
    mocks.storeRepositorySourceFile.mockResolvedValue({
      path: "gitlab/acme/web/en.json",
      outcome: "skipped",
      reason: "unchanged",
      sourceFileVersionId: "version:old",
      storedFileId: "stored:old",
    });
    mocks.versionRows.mockReturnValue([
      { ingestState: "ingested", ingestWorkflowRunId: "wf-old", repositorySourceFileId: "file:en" },
    ]);
    mocks.reportRows.mockReturnValue([
      { id: "version:old", syncReport: { missingKeys: ["old"], reportedRunId: "run-0" } },
    ]);

    const result = await run(fakeReader());

    // The stored report was shown by the run that imported the file.
    expect(isOk(result) && result.value.pulled.files).toEqual([]);
    expect(mocks.markReportsShown).not.toHaveBeenCalled();
  });

  it("shows an unchanged file's report once when the run that imported it never showed it", async () => {
    mocks.storeRepositorySourceFile.mockResolvedValue({
      path: "gitlab/acme/web/en.json",
      outcome: "skipped",
      reason: "unchanged",
      sourceFileVersionId: "version:old",
      storedFileId: "stored:old",
    });
    mocks.versionRows.mockReturnValue([
      { ingestState: "ingested", ingestWorkflowRunId: "wf-old", repositorySourceFileId: "file:en" },
    ]);
    // No reportedRunId: the earlier run failed on another file after this one was ingested.
    mocks.reportRows.mockReturnValue([{ id: "version:old", syncReport: { missingKeys: ["old"] } }]);

    const result = await run(fakeReader());

    expect(isOk(result) && result.value.pulled.files).toEqual([
      { path: "gitlab/acme/web/en.json", missingKeys: ["old"] },
    ]);
    expect(mocks.markReportsShown).toHaveBeenCalledTimes(1);
  });

  it("hides the keys of synced files the repository no longer has, and only this sync's", async () => {
    mocks.syncedFileRows.mockReturnValue([
      { id: "file:en", sourcePath: "gitlab/acme/web/web-en.json" },
      { id: "file:old", sourcePath: "gitlab/acme/web/old-en.json" },
      // Another sync's file under the same project folder, outside this template.
      { id: "file:other", sourcePath: "gitlab/acme/web/admin/en.json" },
      // A translation file is delivery's, never hidden.
      { id: "file:fr", sourcePath: "gitlab/acme/web/old-fr.json" },
    ]);
    mocks.hideKeysMissingFromSync.mockResolvedValue(["a", "b"]);

    const result = await run(
      fakeReader({
        listFiles: async () => ok([{ path: "locales/web-en.json", contentId: null }]),
      }),
      { ...syncConfig, pathTemplate: "*-{{locale}}.json" },
    );

    expect(mocks.hideKeysMissingFromSync).toHaveBeenCalledTimes(1);
    expect(mocks.hideKeysMissingFromSync).toHaveBeenCalledWith(expect.anything(), {
      organizationId: "org-1",
      projectId: "project-1",
      repositorySourceFileId: "file:old",
    });
    expect(isOk(result) && result.value.pulled.files).toEqual([
      { path: "gitlab/acme/web/old-en.json", missingKeys: ["a", "b"] },
    ]);
  });

  it("fails the run when a file can't be read, stored or parsed", async () => {
    const unreadable = await run(
      fakeReader({
        readFile: async () => err({ code: "content_sync_provider_failed", message: "down" }),
      }),
    );
    expect(isErr(unreadable) && unreadable.error).toMatchObject({
      code: "content_sync_pull_failed",
      message: expect.stringContaining("locales/en.json (could not be read"),
    });

    mocks.waitForSourceFileVersionIngest.mockResolvedValueOnce("failed");
    const unparsed = await run(fakeReader());
    expect(isErr(unparsed) && unparsed.error).toEqual({
      code: "content_sync_pull_failed",
      message: "Importing gitlab/acme/web/en.json failed. Check the file in Files.",
    });
  });

  it("reports a missing provider folder, path template and source locale", async () => {
    const emptyFolder = await run(fakeReader({ listFiles: async () => ok([]) }));
    expect(isErr(emptyFolder) && emptyFolder.error.code).toBe("content_sync_folder_invalid");

    const noTemplate = await run(fakeReader(), { ...syncConfig, pathTemplate: "" });
    expect(isErr(noTemplate) && noTemplate.error.code).toBe("content_sync_path_template_required");

    const noMatch = await run(fakeReader(), { ...syncConfig, pathTemplate: "app-{{locale}}.json" });
    expect(isErr(noMatch) && noMatch.error).toMatchObject({
      code: "content_sync_no_source_files",
      message: expect.stringContaining("en-US"),
    });

    mocks.projectRows.mockReturnValue([{ sourceLocale: null, targetLocales: [] }]);
    const noLocale = await run(fakeReader());
    expect(isErr(noLocale) && noLocale.error.code).toBe("content_sync_source_locale_required");
  });

  it("reads through the workspace's server and checks the path still names the chosen project", async () => {
    mocks.resolveGitLabAccess.mockResolvedValue(
      ok({ accessToken: "t", baseUrl: "http://localhost:8929" }),
    );
    mocks.getGitLabProject.mockResolvedValue(ok({ id: 43, pathWithNamespace: "acme/web" }));

    const other = await run(undefined);
    expect(isErr(other) && other.error).toMatchObject({
      code: "content_sync_connection_required",
      message: expect.stringContaining("not the one chosen"),
    });
    expect(mocks.createGitLabContentSyncReader).not.toHaveBeenCalled();

    mocks.getGitLabProject.mockResolvedValue(ok({ id: 42, pathWithNamespace: "acme/web" }));
    mocks.createGitLabContentSyncReader.mockReturnValue(fakeReader());
    const same = await run(undefined);
    expect(isOk(same)).toBe(true);
    expect(mocks.createGitLabContentSyncReader).toHaveBeenCalledWith({
      access: { accessToken: "t", baseUrl: "http://localhost:8929" },
      pathWithNamespace: "acme/web",
    });

    mocks.resolveGitLabAccess.mockResolvedValue(
      err({ code: "gitlab_not_connected" as const, message: "no" }),
    );
    const disconnected = await run(undefined);
    expect(isErr(disconnected) && disconnected.error.code).toBe("content_sync_connection_required");
  });
});
