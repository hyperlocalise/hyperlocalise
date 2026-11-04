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
import { createGitLabContentSyncWriter } from "@/lib/gitlab/content-sync-writer";
import { buildPullTranslationsBranchName } from "@/lib/agents/github/github-repository-automation-pull-translations-branch";
import { isSafeRepositoryRelativePath } from "@/lib/i18n/safe-repository-path";
import { waitForSourceFileVersionIngest } from "@/lib/intercom/wait-for-source-file-ingest";
import { createLogger } from "@/lib/log";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  hideKeysMissingFromSync,
  unhideKeysSyncHid,
} from "@/lib/projects/files/hide-keys-missing-from-sync";
import { enqueueSourceFileIngestAfterUpload } from "@/lib/projects/files/source-file-ingest";
import { SYNC_REPORT_KEY_LIMIT } from "@/lib/projects/files/source-file-sync-report";
import { inferSupportedSourceUploadFormat } from "@/lib/translation/file-formats";

import {
  classifyContentSyncPath,
  compileContentSyncPathTemplate,
  isExactContentSyncLocale,
} from "./content-sync-locale-paths";
import { relativizeContentSyncPath, rewriteContentSyncSourcePath } from "./content-sync-paths";
import type {
  ContentSyncRepositoryReader,
  ContentSyncRepositoryWriter,
} from "./content-sync-provider";
import {
  deliverGitLabTranslations,
  type GitLabDeliverySourceFile,
  type GitLabDeliverySummary,
} from "./deliver-gitlab-translations";
import { GITLAB_CONTENT_SYNC_UPLOAD_SURFACE, type ContentSyncConfig } from "./content-sync-types";
import type { ContentSyncError, ContentSyncSummary } from "./execute-github-content-sync";

const logger = createLogger("content-sync-gitlab");

/** Ingest parses in a sandbox, so a file can take a while; files are waited for together. */
const INGEST_WAIT_TIMEOUT_MS = 120_000;

export type ContentSyncFileReport = {
  /** How many keys were hidden, when more than `missingKeys` lists. */
  missingKeyCount?: number;
  path: string;
  /** Keys this run hid because the repository no longer has them. */
  missingKeys: string[];
};

/** The GitHub summary's shape, plus what a GitLab pull hid or left aside. */
export type GitLabContentSyncSummary = ContentSyncSummary & {
  pushed: ContentSyncSummary["pushed"] &
    Partial<Pick<GitLabDeliverySummary, "heldBack" | "unsupported" | "unreadable" | "error">>;
  pulled: ContentSyncSummary["pulled"] & {
    /** Files under the provider folder that the path template or the locales didn't match. */
    unmatched: number;
    /** Translation files seen in the repository; not imported, delivery owns them. */
    translationFiles: number;
    commitSha: string;
    /** Per file, the keys the repository no longer has. */
    files: ContentSyncFileReport[];
  };
};

export async function executeGitLabContentSync(input: {
  organizationId: string;
  projectId: string;
  automationId: string;
  runId: string;
  syncConfig: ContentSyncConfig;
  /** One merge request branch per sync when given; else per automation. */
  pullRequestBranchKey?: string;
  /** Tests inject a reader (and a writer, or no delivery); the app uses the workspace's connection. */
  reader?: ContentSyncRepositoryReader;
  writer?: ContentSyncRepositoryWriter;
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
  let writer = input.writer;
  if (!reader) {
    const access = await resolveGitLabAccess({ localOrganizationId: input.organizationId });
    if (isErr(access)) {
      return err({
        code: "content_sync_connection_required",
        message:
          access.error.code === "gitlab_connection_decrypt_failed"
            ? "The workspace's saved GitLab token can't be read. Save the connection again in Integrations."
            : "Connect GitLab in Integrations before syncing.",
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
              : "GitLab couldn't be reached. Check the connection in Integrations.",
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
    writer ??= createGitLabContentSyncWriter({
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
  const sourceFiles: { repositoryPath: string; relativePath: string; projectPath: string }[] = [];
  // The code each target locale's existing file uses, so delivery writes to the same name.
  const localeCodes = new Map<string, string>();
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
    });
    if (classified.kind === "translation") {
      translationFiles += 1;
      rememberLocaleCode(localeCodes, classified.locale, template.match(relativePath));
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
    rememberLocaleCode(localeCodes, sourceLocale, template.match(relativePath));
    sourceFiles.push({
      repositoryPath: file.path,
      relativePath,
      projectPath: normalizeSourcePath(projectPath),
    });
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
  const deliverable: GitLabDeliverySourceFile[] = [];
  for (const file of sourceFiles) {
    const content = await reader.readFile({
      commitSha: head.value.commitSha,
      path: file.repositoryPath,
    });
    if (isErr(content)) {
      logger.warn(
        { projectId: input.projectId, code: content.error.code },
        "content sync could not read a source file",
      );
      pulled.failed += 1;
      failedPaths.push(`${file.repositoryPath} (could not be read)`);
      continue;
    }
    deliverable.push({
      relativePath: file.relativePath,
      projectPath: file.projectPath,
      content: content.value,
    });
    const stored = await storeRepositorySourceFile({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: file.projectPath,
      content: content.value,
      commitSha: head.value.commitSha,
      workflowRunId: input.runId,
      uploadSurface: GITLAB_CONTENT_SYNC_UPLOAD_SURFACE,
      skipUnchanged: "content",
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
  const unfinished = outcomes.find(
    ({ outcome }) => outcome !== "ingested" && outcome !== "skipped",
  );
  if (unfinished) {
    const messages = {
      timeout: `Importing ${unfinished.version.path} is taking too long. Check the file in Files and run the sync again.`,
      failed: `Importing ${unfinished.version.path} failed. Check the file in Files.`,
      not_queued: `Importing ${unfinished.version.path} could not be queued. Run the sync again.`,
    };
    return err({
      code: "content_sync_pull_failed",
      message: messages[unfinished.outcome as keyof typeof messages],
    });
  }

  // A file imported by this run has a fresh report; an unchanged file's report counts only if no
  // run has shown it yet (its run may have failed on another file after this one was ingested).
  const reports = await loadSyncReports(versions);
  const files = [
    ...reports.map(({ versionId: _versionId, ...report }) => report),
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
      missingKeys: files.reduce((count, file) => count + file.missingKeys.length, 0),
    },
    "gitlab content sync pulled",
  );

  let pushed: GitLabContentSyncSummary["pushed"] = { written: 0 };
  if (writer) {
    // A refused write is reported on the run, not thrown: the pull above has landed.
    pushed = await deliverGitLabTranslations({
      organizationId: input.organizationId,
      projectId: input.projectId,
      runId: input.runId,
      syncConfig: input.syncConfig,
      reader,
      writer,
      head: head.value,
      template,
      targetLocales,
      localeCodes,
      repositoryPaths: new Set(listing.value.map((file) => file.path)),
      sourceFiles: deliverable,
      branchName: buildPullTranslationsBranchName(
        input.pullRequestBranchKey ?? `workflow-${input.automationId}`,
      ),
    });
  }

  // Marked last, so a run that dies before its record is written shows the report next time.
  await markSyncReportsShown(
    reports.map((report) => report.versionId),
    input.runId,
  );

  return ok({
    pulled: {
      ...pulled,
      unmatched,
      translationFiles,
      commitSha: head.value.commitSha,
      files,
    },
    pushed,
  });
}

/** Remembers which run showed a report, so an unchanged file's report isn't repeated. */
async function markSyncReportsShown(versionIds: string[], runId: string): Promise<void> {
  if (versionIds.length === 0) {
    return;
  }
  await db
    .update(schema.repositorySourceFileVersions)
    .set({
      syncReport: sql`coalesce(${schema.repositorySourceFileVersions.syncReport}, '{}'::jsonb) || ${JSON.stringify({ reportedRunId: runId })}::jsonb`,
    })
    .where(inArray(schema.repositorySourceFileVersions.id, versionIds));
}

/** The code a locale's files use; an exact code (`fr-FR`) beats a bare language (`fr`). */
function rememberLocaleCode(codes: Map<string, string>, locale: string, code: string | null) {
  if (!code) {
    return;
  }
  const current = codes.get(locale);
  if (
    !current ||
    (!isExactContentSyncLocale(current, locale) && isExactContentSyncLocale(code, locale))
  ) {
    codes.set(locale, code);
  }
}

type SyncedVersion = {
  path: string;
  sourceFileVersionId: string;
  /** Set for a file this run didn't store again. */
  unchanged?: { storedFileId: string };
  /** Set when this run queued the file's ingest again, so its report is this run's. */
  requeued?: boolean;
};

type IngestOutcome = "ingested" | "skipped" | "failed" | "timeout" | "not_queued";

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
): Promise<IngestOutcome> {
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
      ingestWorkflowRunId: schema.repositorySourceFileVersions.ingestWorkflowRunId,
      repositorySourceFileId: schema.repositorySourceFileVersions.repositorySourceFileId,
    })
    .from(schema.repositorySourceFileVersions)
    .where(eq(schema.repositorySourceFileVersions.id, version.sourceFileVersionId))
    .limit(1);
  if (!row) {
    return "failed";
  }
  if (row.ingestState === "pending" || row.ingestState === "failed") {
    try {
      await enqueueSourceFileIngestAfterUpload({
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
      return "not_queued";
    }
    version.requeued = true;
    // Until an ingest run claims the version it still reads as failed, which the waiter would
    // take as the answer. A claim changes the run id (a fast failure keeps the new one), and
    // another run's claim counts just as well.
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
        latest.ingestWorkflowRunId !== row.ingestWorkflowRunId ||
        (latest.ingestState !== "pending" && latest.ingestState !== "failed")
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
      reports.push({
        path: file.sourcePath,
        missingKeys: missingKeys.slice(0, SYNC_REPORT_KEY_LIMIT),
        ...(missingKeys.length > SYNC_REPORT_KEY_LIMIT
          ? { missingKeyCount: missingKeys.length }
          : {}),
      });
    }
  }
  return reports;
}

async function loadSyncReports(
  versions: SyncedVersion[],
): Promise<(ContentSyncFileReport & { versionId: string })[]> {
  if (versions.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      id: schema.repositorySourceFileVersions.id,
      syncReport: schema.repositorySourceFileVersions.syncReport,
    })
    .from(schema.repositorySourceFileVersions)
    .where(
      inArray(
        schema.repositorySourceFileVersions.id,
        versions.map((version) => version.sourceFileVersionId),
      ),
    );
  const reportById = new Map(rows.map((row) => [row.id, row.syncReport]));
  return versions
    .map((version) => {
      const report = reportById.get(version.sourceFileVersionId);
      if (!report || report.missingKeys.length === 0) {
        return null;
      }
      if (version.unchanged && !version.requeued && report.reportedRunId) {
        return null;
      }
      return {
        versionId: version.sourceFileVersionId,
        path: version.path,
        missingKeys: report.missingKeys,
        ...(report.missingKeyCount ? { missingKeyCount: report.missingKeyCount } : {}),
      };
    })
    .filter((report) => report !== null);
}
