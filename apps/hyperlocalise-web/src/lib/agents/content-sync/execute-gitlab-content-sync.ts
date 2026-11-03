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
import { and, eq, inArray, like, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { storeRepositorySourceFile } from "@/lib/file-storage/upload-repository-source-files";
import { normalizeSourcePath } from "@/lib/file-storage/records";
import { resolveGitLabAccess } from "@/lib/gitlab/access";
import { getGitLabProject } from "@/lib/gitlab/client";
import { createGitLabContentSyncReader } from "@/lib/gitlab/content-sync-reader";
import { isSafeRepositoryRelativePath } from "@/lib/i18n/safe-repository-path";
import { waitForSourceFileVersionIngest } from "@/lib/intercom/wait-for-source-file-ingest";
import { createLogger } from "@/lib/log";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  hideKeysMissingFromSync,
  unhideKeysSyncHid,
} from "@/lib/projects/files/hide-keys-missing-from-sync";
import { enqueueSourceFileIngestAfterUpload } from "@/lib/projects/files/source-file-ingest";
import type { SourceFileSyncReport } from "@/lib/projects/files/source-file-sync-report";
import { inferSupportedSourceUploadFormat } from "@/lib/translation/file-formats";

import {
  classifyContentSyncPath,
  compileContentSyncPathTemplate,
} from "./content-sync-locale-paths";
import { relativizeContentSyncPath, rewriteContentSyncSourcePath } from "./content-sync-paths";
import type { ContentSyncRepositoryReader } from "./content-sync-provider";
import { GITLAB_CONTENT_SYNC_UPLOAD_SURFACE, type ContentSyncConfig } from "./content-sync-types";
import type { ContentSyncError, ContentSyncSummary } from "./execute-github-content-sync";

const logger = createLogger("content-sync-gitlab");

/** Ingest parses in a sandbox, so a file can take a while; files are waited for together. */
const INGEST_WAIT_TIMEOUT_MS = 120_000;

export type ContentSyncFileReport = SourceFileSyncReport & { path: string };

/** The GitHub summary's shape, plus what a GitLab pull could not settle on its own. */
export type GitLabContentSyncSummary = ContentSyncSummary & {
  pulled: ContentSyncSummary["pulled"] & {
    /** Files under the provider folder that the path template or the locales didn't match. */
    unmatched: number;
    /** Translation files seen in the repository; not imported, delivery owns them. */
    translationFiles: number;
    commitSha: string;
    /** Per file, the keys that clashed and the keys the repository no longer has. */
    files: ContentSyncFileReport[];
  };
};

export async function executeGitLabContentSync(input: {
  organizationId: string;
  projectId: string;
  automationId: string;
  runId: string;
  syncConfig: ContentSyncConfig;
  /** Tests inject a reader; the app reads the workspace's GitLab server. */
  reader?: ContentSyncRepositoryReader;
}): Promise<Result<GitLabContentSyncSummary, ContentSyncError>> {
  const pathTemplate = input.syncConfig.pathTemplate?.trim() ?? "";
  if (!pathTemplate) {
    return err({
      code: "content_sync_path_template_required",
      message: "GitLab sync needs a path template that says where each language's files are.",
    });
  }

  const [project] = await db
    .select({
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
      sourceTextEditable: schema.projects.sourceTextEditable,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.id, input.projectId),
      ),
    )
    .limit(1);
  if (!project) {
    return err({ code: "project_not_found", message: "Choose a project in this organization." });
  }
  const sourceLocale = project.sourceLocale?.trim();
  if (!sourceLocale) {
    return err({
      code: "content_sync_source_locale_required",
      message: "Set the project's source language before syncing.",
    });
  }

  let reader = input.reader;
  if (!reader) {
    const access = await resolveGitLabAccess({ localOrganizationId: input.organizationId });
    if (isErr(access)) {
      return err({
        code: "content_sync_connection_required",
        message:
          access.error.code === "gitlab_connection_decrypt_failed"
            ? "The workspace's saved GitLab token can't be read. Save the connection again in Integrations."
            : "Connect the workspace's GitLab server in Integrations before syncing.",
      });
    }
    // The saved path is looked up on the workspace's current server; the id proves it's still
    // the project that was chosen, not another one at the same path on a replaced server.
    const gitlabProject = await getGitLabProject({
      ...access.value,
      pathWithNamespace: input.syncConfig.resourceKey,
    });
    if (isErr(gitlabProject)) {
      return err({
        code: "content_sync_connection_required",
        message:
          gitlabProject.error.code === "gitlab_not_found"
            ? "The workspace's GitLab token can't see this repository. Check the connection in Integrations."
            : gitlabProject.error.code === "gitlab_unauthorized"
              ? "The workspace's GitLab token was refused. Check the connection in Integrations."
              : "The workspace's GitLab server couldn't be reached. Check the connection in Integrations.",
      });
    }
    if (String(gitlabProject.value.id) !== input.syncConfig.connectionId) {
      return err({
        code: "content_sync_connection_required",
        message:
          "The repository at this path is not the one chosen for this sync. Choose the repository again.",
      });
    }
    reader = createGitLabContentSyncReader({
      access: access.value,
      pathWithNamespace: input.syncConfig.resourceKey,
    });
  }

  const head = await reader.resolveBranchHead({ branch: input.syncConfig.branch });
  if (isErr(head)) {
    return err(head.error);
  }
  const listing = await reader.listFiles({
    commitSha: head.value.commitSha,
    folder: input.syncConfig.providerFolder,
  });
  if (isErr(listing)) {
    return err(listing.error);
  }
  if (listing.value.length === 0 && input.syncConfig.providerFolder.length > 0) {
    return err({
      code: "content_sync_folder_invalid",
      message: "The provider folder was not found in this repository.",
    });
  }

  const template = compileContentSyncPathTemplate(pathTemplate);
  const targetLocales = Array.isArray(project.targetLocales) ? project.targetLocales : [];
  const sourceFiles: { repositoryPath: string; projectPath: string }[] = [];
  let translationFiles = 0;
  let unmatched = 0;
  for (const file of listing.value) {
    const relativePath = relativizeContentSyncPath(input.syncConfig.providerFolder, file.path);
    if (relativePath === null || !isSafeRepositoryRelativePath(file.path)) {
      unmatched += 1;
      continue;
    }
    const classified = classifyContentSyncPath({
      relativePath,
      template,
      sourceLocale,
      targetLocales,
      localeCodes: input.syncConfig.localeCodes,
    });
    if (classified.kind === "translation") {
      translationFiles += 1;
      continue;
    }
    if (classified.kind === "unmatched" || !inferSupportedSourceUploadFormat(file.path)) {
      unmatched += 1;
      continue;
    }
    const projectPath = rewriteContentSyncSourcePath({
      sandboxPath: file.path,
      providerFolder: input.syncConfig.providerFolder,
      projectFolder: input.syncConfig.projectFolder,
    });
    if (!projectPath) {
      unmatched += 1;
      continue;
    }
    sourceFiles.push({ repositoryPath: file.path, projectPath: normalizeSourcePath(projectPath) });
  }

  if (sourceFiles.length === 0) {
    return err({
      code: "content_sync_no_source_files",
      message: `No file under ${input.syncConfig.providerFolder} matches ${pathTemplate} for the source language ${sourceLocale}. Check the language file paths and codes.`,
    });
  }

  const pulled = { uploaded: 0, skipped: 0, failed: 0 };
  const failedPaths: string[] = [];
  const versions: SyncedVersion[] = [];
  for (const file of sourceFiles) {
    const content = await reader.readFile({
      commitSha: head.value.commitSha,
      path: file.repositoryPath,
    });
    if (isErr(content)) {
      logger.warn(
        { projectId: input.projectId, path: file.repositoryPath, code: content.error.code },
        "content sync could not read a source file",
      );
      pulled.failed += 1;
      failedPaths.push(`${file.repositoryPath} (could not be read; a file over 5 MB can't be)`);
      continue;
    }
    const stored = await storeRepositorySourceFile({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: file.projectPath,
      content: content.value,
      commitSha: head.value.commitSha,
      workflowRunId: input.runId,
      uploadSurface: GITLAB_CONTENT_SYNC_UPLOAD_SURFACE,
      // With source text kept to the repository, a platform text that drifted from the file
      // (edits made while the setting was on) is put back by importing the file again.
      skipUnchanged:
        !project.sourceTextEditable &&
        (await fileHasSourceTextDrift({
          organizationId: input.organizationId,
          projectId: input.projectId,
          sourcePath: file.projectPath,
        }))
          ? "never"
          : "content",
    });
    if (stored.outcome === "uploaded") {
      pulled.uploaded += 1;
      versions.push({ path: stored.path, sourceFileVersionId: stored.sourceFileVersionId });
    } else if (stored.outcome === "failed") {
      pulled.failed += 1;
      failedPaths.push(`${file.repositoryPath} (could not be stored)`);
    } else {
      pulled.skipped += 1;
      // Unchanged since the last run, but that run's ingest may have stalled, and an earlier run
      // may have hidden the file's keys while the repository didn't have it.
      if (stored.sourceFileVersionId && stored.storedFileId) {
        versions.push({
          path: stored.path,
          sourceFileVersionId: stored.sourceFileVersionId,
          unchanged: { storedFileId: stored.storedFileId },
        });
      }
    }
  }

  if (pulled.failed > 0) {
    return err({
      code: "content_sync_pull_failed",
      message: `These files could not be imported: ${failedPaths.join(", ")}.`,
    });
  }

  // Delivery reads the keys ingest wrote, so the run isn't done until every file is parsed.
  const outcomes = await Promise.all(
    versions.map(async (version) => ({
      version,
      outcome: await waitForIngest(
        { organizationId: input.organizationId, projectId: input.projectId },
        version,
      ),
    })),
  );
  const unfinished = outcomes.find(({ outcome }) => outcome === "failed" || outcome === "timeout");
  if (unfinished) {
    return err({
      code: "content_sync_pull_failed",
      message:
        unfinished.outcome === "timeout"
          ? `Importing ${unfinished.version.path} is taking too long. Check the file in Files and run the sync again.`
          : `Importing ${unfinished.version.path} failed. Check the file in Files.`,
    });
  }

  const files = [
    ...(await loadSyncReports(versions)),
    ...(await hideFilesMissingFromRepository({
      organizationId: input.organizationId,
      projectId: input.projectId,
      syncConfig: input.syncConfig,
      template,
      sourceLocale,
      targetLocales,
      presentPaths: sourceFiles.map((file) => file.projectPath),
    })),
  ];

  logger.info(
    {
      automationId: input.automationId,
      pulled,
      unmatched,
      translationFiles,
      clashes: files.reduce((count, file) => count + file.clashes.length, 0),
      missingKeys: files.reduce((count, file) => count + file.missingKeys.length, 0),
    },
    "gitlab content sync pulled",
  );

  return ok({
    pulled: {
      ...pulled,
      unmatched,
      translationFiles,
      commitSha: head.value.commitSha,
      files,
    },
    pushed: { written: 0 },
  });
}

type SyncedVersion = {
  path: string;
  sourceFileVersionId: string;
  /** Set for a file this run didn't store again. */
  unchanged?: { storedFileId: string };
};

/** How long a re-queued ingest may take to be picked up before the run gives up on it. */
const INGEST_PICKUP_TIMEOUT_MS = 30_000;
const INGEST_PICKUP_POLL_MS = 500;

/**
 * Waits for the version's ingest. For a file stored by an earlier run, an ingest that never
 * ran or failed is queued again first, and keys an earlier run hid while the repository didn't
 * have the file are shown again, since no ingest will do it.
 */
async function waitForIngest(
  scope: { organizationId: string; projectId: string },
  version: SyncedVersion,
): Promise<"ingested" | "skipped" | "failed" | "timeout"> {
  if (!version.unchanged) {
    return waitForSourceFileVersionIngest({
      organizationId: scope.organizationId,
      sourceFileVersionId: version.sourceFileVersionId,
      timeoutMs: INGEST_WAIT_TIMEOUT_MS,
    });
  }
  const [row] = await db
    .select({
      ingestState: schema.repositorySourceFileVersions.ingestState,
      repositorySourceFileId: schema.repositorySourceFileVersions.repositorySourceFileId,
    })
    .from(schema.repositorySourceFileVersions)
    .where(eq(schema.repositorySourceFileVersions.id, version.sourceFileVersionId))
    .limit(1);
  if (!row) {
    return "failed";
  }
  if (row.ingestState === "pending" || row.ingestState === "failed") {
    let queued: { workflowRunIds: string[] };
    try {
      queued = await enqueueSourceFileIngestAfterUpload({
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        storedFileId: version.unchanged.storedFileId,
        sourceFileVersionId: version.sourceFileVersionId,
        sourcePath: version.path,
      });
    } catch (error) {
      logger.warn(
        { sourceFileVersionId: version.sourceFileVersionId, err: error },
        "content sync could not queue an ingest again",
      );
      return "failed";
    }
    // Until the queued ingest claims the version it still reads as failed, which the waiter
    // would take as the answer. The claim records the run id, and a fast failure keeps it.
    const pickupDeadline = Date.now() + INGEST_PICKUP_TIMEOUT_MS;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, INGEST_PICKUP_POLL_MS));
      const [latest] = await db
        .select({
          ingestState: schema.repositorySourceFileVersions.ingestState,
          ingestWorkflowRunId: schema.repositorySourceFileVersions.ingestWorkflowRunId,
        })
        .from(schema.repositorySourceFileVersions)
        .where(eq(schema.repositorySourceFileVersions.id, version.sourceFileVersionId))
        .limit(1);
      if (
        !latest ||
        (latest.ingestWorkflowRunId &&
          queued.workflowRunIds.includes(latest.ingestWorkflowRunId)) ||
        latest.ingestState === "ingested" ||
        latest.ingestState === "skipped"
      ) {
        break;
      }
      if (Date.now() > pickupDeadline) {
        return "timeout";
      }
    }
  }
  const outcome = await waitForSourceFileVersionIngest({
    organizationId: scope.organizationId,
    sourceFileVersionId: version.sourceFileVersionId,
    timeoutMs: INGEST_WAIT_TIMEOUT_MS,
  });
  if (outcome === "ingested") {
    await unhideKeysSyncHid(db, {
      repositorySourceFileId: row.repositorySourceFileId,
      sourceFileVersionId: version.sourceFileVersionId,
    });
  }
  return outcome;
}

/** Whether any key of the file carries a source text other than the one last imported. */
async function fileHasSourceTextDrift(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
}): Promise<boolean> {
  const [drifted] = await db
    .select({ id: schema.projectTranslationKeys.id })
    .from(schema.projectTranslationKeys)
    .innerJoin(
      schema.repositorySourceFiles,
      eq(schema.repositorySourceFiles.id, schema.projectTranslationKeys.repositorySourceFileId),
    )
    .where(
      and(
        eq(schema.repositorySourceFiles.organizationId, input.organizationId),
        eq(schema.repositorySourceFiles.projectId, input.projectId),
        eq(schema.repositorySourceFiles.sourcePath, input.sourcePath),
        sql`${schema.projectTranslationKeys.sourceText} IS DISTINCT FROM ${schema.projectTranslationKeys.importedSourceText}`,
      ),
    )
    .limit(1);
  return drifted !== undefined;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * A file the repository dropped is a file of missing keys: they are hidden the same way, and
 * shown again when the file returns. Only files this sync would import are considered, so
 * another sync's files under the same project folder are left alone.
 */
async function hideFilesMissingFromRepository(input: {
  organizationId: string;
  projectId: string;
  syncConfig: ContentSyncConfig;
  template: ReturnType<typeof compileContentSyncPathTemplate>;
  sourceLocale: string;
  targetLocales: string[];
  presentPaths: string[];
}): Promise<ContentSyncFileReport[]> {
  const present = new Set(input.presentPaths);
  const synced = await db
    .select({
      id: schema.repositorySourceFiles.id,
      sourcePath: schema.repositorySourceFiles.sourcePath,
    })
    .from(schema.repositorySourceFiles)
    .innerJoin(
      schema.repositorySourceFileVersions,
      eq(
        schema.repositorySourceFileVersions.id,
        schema.repositorySourceFiles.reconciledSourceFileVersionId,
      ),
    )
    .where(
      and(
        eq(schema.repositorySourceFiles.organizationId, input.organizationId),
        eq(schema.repositorySourceFiles.projectId, input.projectId),
        like(
          schema.repositorySourceFiles.sourcePath,
          `${escapeLikePattern(input.syncConfig.projectFolder)}/%`,
        ),
        eq(schema.repositorySourceFileVersions.uploadSurface, GITLAB_CONTENT_SYNC_UPLOAD_SURFACE),
      ),
    );
  const reports: ContentSyncFileReport[] = [];
  for (const file of synced) {
    if (present.has(file.sourcePath)) {
      continue;
    }
    const relativePath = relativizeContentSyncPath(input.syncConfig.projectFolder, file.sourcePath);
    const classified =
      relativePath === null
        ? null
        : classifyContentSyncPath({
            relativePath,
            template: input.template,
            sourceLocale: input.sourceLocale,
            targetLocales: input.targetLocales,
            localeCodes: input.syncConfig.localeCodes,
          });
    if (classified?.kind !== "source") {
      continue;
    }
    const missingKeys = await hideKeysMissingFromSync(db, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      repositorySourceFileId: file.id,
    });
    if (missingKeys.length > 0) {
      reports.push({ path: file.sourcePath, clashes: [], missingKeys });
    }
  }
  return reports;
}

async function loadSyncReports(versions: SyncedVersion[]): Promise<ContentSyncFileReport[]> {
  if (versions.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      id: schema.repositorySourceFileVersions.id,
      repositorySourceFileId: schema.repositorySourceFileVersions.repositorySourceFileId,
      syncReport: schema.repositorySourceFileVersions.syncReport,
    })
    .from(schema.repositorySourceFileVersions)
    .where(
      inArray(
        schema.repositorySourceFileVersions.id,
        versions.map((version) => version.sourceFileVersionId),
      ),
    );
  const reportById = new Map(rows.map((row) => [row.id, row]));
  const reports: ContentSyncFileReport[] = [];
  for (const version of versions) {
    const row = reportById.get(version.sourceFileVersionId);
    if (!row?.syncReport) {
      continue;
    }
    let report = row.syncReport;
    if (version.unchanged) {
      // The file wasn't imported again, so its last report is history, except for a clash that
      // still stands: that is reported on every run until one side gives way.
      report = {
        clashes: await standingClashes(row.repositorySourceFileId, report.clashes),
        missingKeys: [],
      };
    }
    if (report.clashes.length > 0 || report.missingKeys.length > 0) {
      reports.push({ path: version.path, ...report });
    }
  }
  return reports;
}

async function standingClashes(repositorySourceFileId: string, keys: string[]): Promise<string[]> {
  if (keys.length === 0) {
    return [];
  }
  const rows = await db
    .select({ key: schema.projectTranslationKeys.key })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.repositorySourceFileId, repositorySourceFileId),
        inArray(schema.projectTranslationKeys.key, keys),
        sql`${schema.projectTranslationKeys.sourceText} IS DISTINCT FROM ${schema.projectTranslationKeys.importedSourceText}`,
      ),
    );
  return rows.map((row) => row.key).sort();
}
