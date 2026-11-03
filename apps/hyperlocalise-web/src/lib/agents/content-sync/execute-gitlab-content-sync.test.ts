import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { err, isErr, isOk, ok } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  projectRows: vi.fn(),
  reportRows: vi.fn(),
  storeRepositorySourceFile: vi.fn(),
  waitForSourceFileVersionIngest: vi.fn(),
  resolveGitLabAccess: vi.fn(),
  getGitLabProject: vi.fn(),
  createGitLabContentSyncReader: vi.fn(),
}));

vi.mock("@/lib/database/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        // One query ends in `.limit()` (the project), the other is awaited as is (the reports).
        where: () =>
          Object.assign(Promise.resolve(mocks.reportRows()), {
            limit: () => Promise.resolve(mocks.projectRows()),
          }),
      })),
    })),
  },
  schema: {
    projects: { id: "id", organizationId: "organizationId" },
    repositorySourceFileVersions: { id: "id", syncReport: "syncReport" },
  },
}));
vi.mock("@/lib/file-storage/upload-repository-source-files", () => ({
  storeRepositorySourceFile: (...args: unknown[]) => mocks.storeRepositorySourceFile(...args),
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
  localeCodes: { "en-US": "en", "fr-FR": "fr" },
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
  });

  it("imports only the source locale's matching files and waits for their ingest", async () => {
    const reader = fakeReader();
    mocks.reportRows.mockReturnValue([
      {
        id: "version:gitlab/acme/web/en.json",
        syncReport: { clashes: ["title"], missingKeys: ["old"] },
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
        files: [{ path: "gitlab/acme/web/en.json", clashes: ["title"], missingKeys: ["old"] }],
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
    });
    expect(mocks.waitForSourceFileVersionIngest).toHaveBeenCalledWith({
      organizationId: "org-1",
      sourceFileVersionId: "version:gitlab/acme/web/en.json",
      timeoutMs: 120_000,
    });
  });

  it("counts an unchanged file as skipped and a superseded ingest as finished", async () => {
    mocks.storeRepositorySourceFile.mockResolvedValueOnce({
      path: "gitlab/acme/web/en.json",
      outcome: "skipped",
      reason: "unchanged_for_commit",
    });
    const skipped = await run(fakeReader());
    expect(isOk(skipped) && skipped.value.pulled).toMatchObject({ uploaded: 0, skipped: 1 });
    expect(mocks.waitForSourceFileVersionIngest).not.toHaveBeenCalled();

    mocks.waitForSourceFileVersionIngest.mockResolvedValueOnce("skipped");
    const superseded = await run(fakeReader());
    expect(isOk(superseded) && superseded.value.pulled).toMatchObject({ uploaded: 1 });
  });

  it("fails the run when a file can't be read, stored or parsed", async () => {
    const unreadable = await run(
      fakeReader({
        readFile: async () => err({ code: "content_sync_provider_failed", message: "down" }),
      }),
    );
    expect(isErr(unreadable) && unreadable.error.code).toBe("content_sync_pull_failed");

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
