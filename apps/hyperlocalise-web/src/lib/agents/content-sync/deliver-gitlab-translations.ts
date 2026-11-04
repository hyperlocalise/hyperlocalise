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
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { loadProjectHtmlTranslationDownload } from "@/lib/projects/files/html-translation-download";
import { loadProjectTranslationsAsPrefilledEntries } from "@/lib/projects/translations/project-translation-service";
import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";

import { isContentSyncJsonCompatiblePath } from "./content-sync-export";
import { buildContentSyncJsonTranslationFile } from "./content-sync-json-delivery";
import type { compileContentSyncPathTemplate } from "./content-sync-locale-paths";
import { joinContentSyncPath } from "./content-sync-paths";
import type {
  ContentSyncBranchHead,
  ContentSyncFileChange,
  ContentSyncRepositoryReader,
  ContentSyncRepositoryWriter,
} from "./content-sync-provider";
import type { ContentSyncConfig } from "./content-sync-types";
import type { ContentSyncError } from "./execute-github-content-sync";

const logger = createLogger("content-sync-gitlab-delivery");

export type GitLabDeliverySummary = {
  /** Language files committed this run. */
  written: number;
  pullRequestUrl?: string;
  /** Language files that wait until every one of their segments is approved. */
  heldBack: number;
  /** Source files in a format a GitLab sync can't write back yet. */
  unsupported: number;
};

export type GitLabDeliverySourceFile = {
  /** Under the provider folder, as the template matched it. */
  relativePath: string;
  /** In the project. */
  projectPath: string;
  content: Buffer;
};

/**
 * Sends approved translations back as one merge request per sync: one language file per source
 * file and target locale, built from the source file's own shape, written to one fixed branch and
 * updated in place on each run. A file whose bytes wouldn't change is left out; when nothing
 * changes, the open merge request is left as it is.
 */
export async function deliverGitLabTranslations(input: {
  organizationId: string;
  projectId: string;
  runId: string;
  syncConfig: ContentSyncConfig;
  reader: ContentSyncRepositoryReader;
  writer: ContentSyncRepositoryWriter;
  /** The branch the run read from and the merge request targets. */
  head: ContentSyncBranchHead;
  template: ReturnType<typeof compileContentSyncPathTemplate>;
  targetLocales: string[];
  /** Project locale to the code the repository already uses for it, where a file exists. */
  localeCodes: Map<string, string>;
  sourceFiles: GitLabDeliverySourceFile[];
  branchName: string;
}): Promise<Result<GitLabDeliverySummary, ContentSyncError>> {
  const summary: GitLabDeliverySummary = { written: 0, heldBack: 0, unsupported: 0 };
  if (input.sourceFiles.length === 0 || input.targetLocales.length === 0) {
    return ok(summary);
  }

  // Existing language files are read from the sync branch when it exists, so a run compares
  // against what it sent last time; otherwise from the commit the run read.
  const syncBranch = await input.reader.resolveBranchHead({ branch: input.branchName });
  let baseCommitSha = input.head.commitSha;
  if (isErr(syncBranch)) {
    if (syncBranch.error.code !== "content_sync_branch_not_found") {
      return err(syncBranch.error);
    }
  } else {
    baseCommitSha = syncBranch.value.commitSha;
  }

  const changes: ContentSyncFileChange[] = [];
  for (const file of input.sourceFiles) {
    const format = isContentSyncJsonCompatiblePath(file.relativePath)
      ? "json"
      : inferSupportedTranslationFileFormat(file.relativePath) === "html"
        ? "html"
        : null;
    if (!format) {
      summary.unsupported += 1;
      continue;
    }
    const hiddenKeys = await loadHiddenKeys(input, file.projectPath);
    for (const locale of input.targetLocales) {
      const code = input.localeCodes.get(locale) ?? locale;
      const relativePath = input.template.rewriteLocale(file.relativePath, code);
      if (!relativePath || relativePath === file.relativePath) {
        continue;
      }
      const repositoryPath = joinContentSyncPath(input.syncConfig.providerFolder, relativePath);
      const existing = await readExisting(input.reader, baseCommitSha, repositoryPath);
      if (isErr(existing)) {
        return err(existing.error);
      }
      const built = await buildLanguageFile({
        ...input,
        file,
        format,
        locale,
        hiddenKeys,
        existing: existing.value,
      });
      if (built === "held_back") {
        summary.heldBack += 1;
        continue;
      }
      if (!built || (existing.value && existing.value.equals(built))) {
        continue;
      }
      changes.push({ path: repositoryPath, content: built, exists: existing.value !== null });
    }
  }

  if (changes.length === 0) {
    return ok(summary);
  }

  const shortRun = input.runId.slice(0, 8);
  const commit = await input.writer.commitFiles({
    branch: input.branchName,
    startFrom: input.head,
    message: `chore(i18n): update translations (${shortRun})`,
    changes,
  });
  if (isErr(commit)) {
    return err({ code: "content_sync_push_failed", message: commit.error.message });
  }
  const review = await input.writer.upsertReview({
    sourceBranch: input.branchName,
    targetBranch: input.head.branch,
    title: "chore(i18n): update translations",
    description: [
      "## Hyperlocalise translation sync",
      "",
      "This merge request writes approved Hyperlocalise translations back to the repository. It is updated in place on each sync run, so make translation fixes in Hyperlocalise rather than here.",
      "",
      `- Language files in this update: ${changes.length}`,
      `- Sync run: ${shortRun}`,
    ].join("\n"),
  });
  if (isErr(review)) {
    return err({ code: "content_sync_push_failed", message: review.error.message });
  }
  logger.info(
    { projectId: input.projectId, written: changes.length, heldBack: summary.heldBack },
    "gitlab content sync delivered translations",
  );
  return ok({ ...summary, written: changes.length, pullRequestUrl: review.value.url });
}

async function readExisting(
  reader: ContentSyncRepositoryReader,
  commitSha: string,
  path: string,
): Promise<Result<Buffer | null, ContentSyncError>> {
  const result = await reader.readFile({ commitSha, path });
  if (isErr(result)) {
    return result.error.code === "content_sync_file_not_found" ? ok(null) : err(result.error);
  }
  return ok(result.value);
}

/** Keys the repository dropped stay out of what is sent back, approved or not. */
async function loadHiddenKeys(
  input: { organizationId: string; projectId: string },
  projectPath: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ key: schema.projectTranslationKeys.key })
    .from(schema.projectTranslationKeys)
    .innerJoin(
      schema.repositorySourceFiles,
      eq(schema.repositorySourceFiles.id, schema.projectTranslationKeys.repositorySourceFileId),
    )
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, input.organizationId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.repositorySourceFiles.sourcePath, projectPath),
        eq(schema.projectTranslationKeys.isHidden, true),
      ),
    );
  return new Set(rows.map((row) => row.key));
}

async function buildLanguageFile(input: {
  organizationId: string;
  projectId: string;
  file: GitLabDeliverySourceFile;
  format: "json" | "html";
  locale: string;
  hiddenKeys: Set<string>;
  existing: Buffer | null;
}): Promise<Buffer | null | "held_back"> {
  const loaded = await loadProjectTranslationsAsPrefilledEntries({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.file.projectPath,
    targetLocale: input.locale,
    readyTranslationsOnly: true,
    approvedTranslationsOnly: true,
  });
  const approved: Record<string, string> = {};
  for (const [key, text] of Object.entries(loaded.prefilled)) {
    if (!input.hiddenKeys.has(key)) {
      approved[key] = text;
    }
  }
  const approvedCount = Object.keys(approved).length;

  if (input.format === "html") {
    // A page is one document: it goes out whole, once every segment is approved.
    if (approvedCount === 0 || approvedCount < loaded.loadedKeyCount - input.hiddenKeys.size) {
      return approvedCount === 0 ? null : "held_back";
    }
    const download = await loadProjectHtmlTranslationDownload({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.file.projectPath,
      targetLocale: input.locale,
      approvedTranslationsOnly: true,
    });
    if (isErr(download) || !download.value) {
      return null;
    }
    return download.value.content;
  }

  if (approvedCount === 0 && !input.existing) {
    return null;
  }
  return buildContentSyncJsonTranslationFile({
    source: input.file.content,
    existing: input.existing,
    approved,
  });
}
