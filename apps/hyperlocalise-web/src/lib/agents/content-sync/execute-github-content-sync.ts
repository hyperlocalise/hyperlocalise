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
import { and, eq, like } from "drizzle-orm";

import { canPushToGitHubRepository } from "@/lib/agents/repository-write-gate";
import { db, schema } from "@/lib/database/client";
import { uploadRepositorySourceFilesFromSandbox } from "@/lib/file-storage/upload-repository-source-files";
import { inferSupportedSourceUploadFormat } from "@/lib/translation/file-formats";
import { runSandboxCommand } from "@/lib/translation/sandbox";
import { isSafeRepositoryRelativePath } from "@/lib/i18n/safe-repository-path";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { loadProjectTranslationsAsPrefilledEntries } from "@/lib/projects/translations/project-translation-service";
import { createLogger } from "@/lib/log";

import {
  createGithubRepositoryAutomationSandbox,
  resolveDefaultBranchHeadSha,
  stopGithubRepositoryAutomationSandbox,
} from "@/lib/agents/github/github-repository-automation-sandbox";
import { commitPushAndCreatePullTranslationsPullRequest } from "@/lib/agents/github/github-repository-automation-pull-translations-pr";
import { buildPullTranslationsBranchName } from "@/lib/agents/github/github-repository-automation-pull-translations-branch";

import { rewriteContentSyncProviderPath, rewriteContentSyncSourcePath } from "./content-sync-paths";
import type { ContentSyncConfig } from "./content-sync-types";

const logger = createLogger("content-sync-github");

export type ContentSyncSummary = {
  pulled: { uploaded: number; skipped: number; failed: number };
  pushed: { written: number; pullRequestUrl?: string };
};

export type ContentSyncError = {
  code: string;
  message: string;
};

function parseGitLsFiles(output: string): string[] {
  return output
    .split("\0")
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
}

export async function executeGithubContentSync(input: {
  organizationId: string;
  projectId: string;
  automationId: string;
  runId: string;
  syncConfig: ContentSyncConfig;
}): Promise<Result<ContentSyncSummary, ContentSyncError>> {
  const [repository] = await db
    .select()
    .from(schema.githubInstallationRepositories)
    .where(
      and(
        eq(schema.githubInstallationRepositories.organizationId, input.organizationId),
        eq(schema.githubInstallationRepositories.id, input.syncConfig.connectionId),
      ),
    )
    .limit(1);

  if (!repository) {
    return err({
      code: "content_sync_connection_required",
      message: "Connect this provider in Integrations before enabling content sync.",
    });
  }
  if (!repository.enabled || repository.archived) {
    return err({
      code: "content_sync_connection_required",
      message: "Enable this repository in Integrations before syncing.",
    });
  }

  const [owner, repo] = repository.fullName.split("/");
  if (!owner || !repo) {
    return err({
      code: "content_sync_connection_required",
      message: "The GitHub repository name is invalid.",
    });
  }

  const head = await resolveDefaultBranchHeadSha({
    installationId: repository.githubInstallationId,
    owner,
    repo,
    branch: repository.defaultBranch,
  });

  let sandboxId: string | null = null;
  try {
    sandboxId = await createGithubRepositoryAutomationSandbox({
      installationId: repository.githubInstallationId,
      repositoryFullName: repository.fullName,
      revision: head.sha,
      cloneDepth: 1,
    });

    const folderArgs =
      input.syncConfig.providerFolder.length > 0 ? ["--", input.syncConfig.providerFolder] : [];
    const listResult = await runSandboxCommand(
      sandboxId,
      "git",
      ["ls-files", "-z", ...folderArgs],
      {
        output: "stdout",
      },
    );
    if (listResult.exitCode !== 0) {
      return err({
        code: "content_sync_folder_invalid",
        message: "Could not list files in the provider folder.",
      });
    }

    const sandboxPaths = parseGitLsFiles(listResult.output).filter(
      (path) => isSafeRepositoryRelativePath(path) && inferSupportedSourceUploadFormat(path),
    );

    if (sandboxPaths.length === 0 && input.syncConfig.providerFolder.length > 0) {
      const folderCheck = await runSandboxCommand(
        sandboxId,
        "git",
        ["ls-files", "--error-unmatch", input.syncConfig.providerFolder],
        { output: "stdout" },
      );
      if (folderCheck.exitCode !== 0) {
        return err({
          code: "content_sync_folder_invalid",
          message: "The provider folder was not found in this repository.",
        });
      }
    }

    const fileResults = await uploadRepositorySourceFilesFromSandbox({
      sandboxId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      paths: sandboxPaths,
      commitSha: head.sha,
      workflowRunId: input.runId,
      uploadSurface: "content_sync",
      rewriteSourcePath: (sandboxPath) =>
        rewriteContentSyncSourcePath({
          sandboxPath,
          providerFolder: input.syncConfig.providerFolder,
          projectFolder: input.syncConfig.projectFolder,
        }),
    });

    const pulled = { uploaded: 0, skipped: 0, failed: 0 };
    for (const result of fileResults) {
      if (result.outcome === "uploaded") {
        pulled.uploaded += 1;
      } else if (result.outcome === "failed") {
        pulled.failed += 1;
      } else {
        pulled.skipped += 1;
      }
    }

    if (pulled.failed > 0) {
      return err({
        code: "content_sync_pull_failed",
        message: "Some source files failed to import.",
      });
    }

    const pushResult = await pushGithubTranslations({
      sandboxId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      runId: input.runId,
      installationId: repository.githubInstallationId,
      githubRepositoryId: repository.githubRepositoryId,
      repositoryFullName: repository.fullName,
      baseBranch: head.branch,
      baseSha: head.sha,
      syncConfig: input.syncConfig,
    });

    if (isErr(pushResult)) {
      return err(pushResult.error);
    }

    logger.info(
      {
        automationId: input.automationId,
        pulled,
        pushed: pushResult.value,
      },
      "github content sync completed",
    );

    return ok({
      pulled,
      pushed: pushResult.value,
    });
  } finally {
    if (sandboxId) {
      await stopGithubRepositoryAutomationSandbox(sandboxId);
    }
  }
}

async function pushGithubTranslations(input: {
  sandboxId: string;
  organizationId: string;
  projectId: string;
  runId: string;
  installationId: string;
  githubRepositoryId: string;
  repositoryFullName: string;
  baseBranch: string;
  baseSha: string;
  syncConfig: ContentSyncConfig;
}): Promise<Result<{ written: number; pullRequestUrl?: string }, ContentSyncError>> {
  const installationId = Number.parseInt(input.installationId, 10);
  if (!Number.isFinite(installationId)) {
    return ok({ written: 0 });
  }
  const writeGate = await canPushToGitHubRepository({
    installationId,
    repositoryFullName: input.repositoryFullName,
  });
  if (!writeGate.canPush) {
    return ok({ written: 0 });
  }

  const [project] = await db
    .select({
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

  const targetLocales = Array.isArray(project?.targetLocales) ? project.targetLocales : [];
  if (targetLocales.length === 0) {
    return ok({ written: 0 });
  }

  const prefix = `${input.syncConfig.projectFolder.replace(/\/+$/, "")}/%`;
  const sourceFiles = await db
    .select({ sourcePath: schema.repositorySourceFiles.sourcePath })
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.organizationId, input.organizationId),
        eq(schema.repositorySourceFiles.projectId, input.projectId),
        like(schema.repositorySourceFiles.sourcePath, prefix),
      ),
    );

  const candidates: { targetPath: string; content: Buffer }[] = [];
  for (const file of sourceFiles) {
    const providerPath = rewriteContentSyncProviderPath({
      projectPath: file.sourcePath,
      providerFolder: input.syncConfig.providerFolder,
      projectFolder: input.syncConfig.projectFolder,
    });
    if (!providerPath) {
      continue;
    }

    for (const locale of targetLocales) {
      const result = await loadProjectTranslationsAsPrefilledEntries({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath: file.sourcePath,
        targetLocale: locale,
        includeAllSourceKeys: true,
      });
      if (result.loadedKeyCount === 0) {
        continue;
      }
      const extensionIndex = providerPath.lastIndexOf(".");
      const localePath =
        extensionIndex > 0
          ? `${providerPath.slice(0, extensionIndex)}-${locale}${providerPath.slice(extensionIndex)}`
          : `${providerPath}-${locale}`;
      candidates.push({
        targetPath: localePath,
        content: Buffer.from(`${JSON.stringify(result.prefilled, null, 2)}\n`, "utf8"),
      });
    }
  }

  if (candidates.length === 0) {
    return ok({ written: 0 });
  }

  const exportCandidates = candidates.map((candidate) => ({
    sourcePath: candidate.targetPath,
    targetPath: candidate.targetPath,
    locale: "",
    translationJobId: input.runId,
    outputFileId: input.runId,
    content: candidate.content,
  }));
  const pr = await commitPushAndCreatePullTranslationsPullRequest({
    sandboxId: input.sandboxId,
    installationId: input.installationId,
    repositoryFullName: input.repositoryFullName,
    automationJobId: input.runId,
    organizationSlug: null,
    githubRepositoryId: input.githubRepositoryId,
    baseBranch: input.baseBranch,
    baseSha: input.baseSha,
    branchName: buildPullTranslationsBranchName(input.runId),
    paths: candidates.map((candidate) => candidate.targetPath),
    candidates: exportCandidates,
    linkedTranslationJobIds: [],
  });

  return ok({
    written: candidates.length,
    pullRequestUrl: pr.pullRequestUrl,
  });
}
