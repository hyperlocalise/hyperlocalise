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

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { loadProjectHtmlTranslationDownload } from "@/lib/projects/files/html-translation-download";
import { loadProjectTranslationsAsPrefilledEntries } from "@/lib/projects/translations/project-translation-service";
import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";

import { isContentSyncJsonCompatiblePath } from "./content-sync-export";
import {
  buildContentSyncJsonTranslationFile,
  isContentSyncLottieFile,
} from "./content-sync-json-delivery";
import type { compileContentSyncPathTemplate } from "./content-sync-locale-paths";
import { joinContentSyncPath } from "./content-sync-paths";
import type {
  ContentSyncBranchHead,
  ContentSyncFileChange,
  ContentSyncProviderError,
  ContentSyncRepositoryReader,
  ContentSyncRepositoryWriter,
} from "./content-sync-provider";
import type { ContentSyncConfig } from "./content-sync-types";

const logger = createLogger("content-sync-gitlab-delivery");

/** Reads of existing language files at once; GitLab.com's per-user limits are far above this. */
const READ_CONCURRENCY = 6;

export type GitLabDeliverySummary = {
  /** Language files committed this run. */
  written: number;
  /** The open merge request, whether or not this run changed it. */
  pullRequestUrl?: string;
  /** Language files (pages) that wait until every segment is approved. */
  heldBack: number;
  /** Lists inside sent files that wait until every item is approved. */
  listsHeldBack: number;
  /** Source files in a format a GitLab sync can't write back (YAML, PO, Lottie…). */
  unsupported: number;
  /** Language files skipped because the repository's copy, or the source, couldn't be read. */
  unreadable: number;
  /** Language files two source files would both write, or that would overwrite a source file; none is sent. */
  conflicts: number;
  /** Why nothing was sent, when GitLab refused the write; the pull has still landed. */
  error?: { code: string; message: string };
};

export type GitLabDeliverySourceFile = {
  /** Under the provider folder, as the template matched it. */
  relativePath: string;
  /** In the project. */
  projectPath: string;
  content: Buffer;
};

export type GitLabDeliveryInput = {
  organizationId: string;
  projectId: string;
  runId: string;
  syncConfig: ContentSyncConfig;
  reader: ContentSyncRepositoryReader;
  writer: ContentSyncRepositoryWriter;
  /** The branch the run read from and the merge request targets. */
  head: ContentSyncBranchHead;
  template: ReturnType<typeof compileContentSyncPathTemplate>;
  sourceLocale: string;
  targetLocales: string[];
  /** Project locale (source included) to the code the repository already uses for it. */
  localeCodes: Map<string, string>;
  /** Every file under the provider folder at the head commit. */
  repositoryPaths: Set<string>;
  sourceFiles: GitLabDeliverySourceFile[];
  branchName: string;
};

type Change = ContentSyncFileChange & { content: Buffer };

/**
 * Sends approved translations back as one merge request per sync: one language file per source
 * file and target locale, built from the source file's own shape against the target commit, on
 * one branch rebuilt from that commit each run. A file whose content wouldn't change is left out;
 * when nothing changes the open merge request is linked, or closed when it still carries text
 * that is no longer approved. A merge request a reviewer closed stays closed as long as the same
 * content is what the sync would send. A refused write is reported on the run, not thrown: the
 * pull has already landed.
 */
export async function deliverGitLabTranslations(
  input: GitLabDeliveryInput,
): Promise<GitLabDeliverySummary> {
  const summary: GitLabDeliverySummary = {
    written: 0,
    heldBack: 0,
    listsHeldBack: 0,
    unsupported: 0,
    unreadable: 0,
    conflicts: 0,
  };
  if (input.sourceFiles.length === 0 || input.targetLocales.length === 0) {
    return summary;
  }

  type Candidate = { file: GitLabDeliverySourceFile; locale: string; code: string; path: string };
  const candidates: Candidate[] = [];
  const sourcesByPath = new Map<string, number>();
  const sourcePaths = new Set(
    input.sourceFiles.map((file) =>
      joinContentSyncPath(input.syncConfig.providerFolder, file.relativePath),
    ),
  );
  const formats = new Map<GitLabDeliverySourceFile, "json" | "html">();
  const locales = [input.sourceLocale, ...input.targetLocales];
  for (const file of input.sourceFiles) {
    const format = isContentSyncJsonCompatiblePath(file.relativePath)
      ? isContentSyncLottieFile(file.content)
        ? null
        : "json"
      : inferSupportedTranslationFileFormat(file.relativePath) === "html"
        ? "html"
        : null;
    if (!format) {
      summary.unsupported += 1;
      continue;
    }
    formats.set(file, format);
    for (const locale of input.targetLocales) {
      const code = codeFor(locale, input.localeCodes, locales);
      const relativePath = input.template.rewriteLocale(file.relativePath, code);
      if (!relativePath) {
        continue;
      }
      const path = joinContentSyncPath(input.syncConfig.providerFolder, relativePath);
      if (sourcePaths.has(path)) {
        // A language file that would overwrite a source file (an `en-GB` named `en`): never.
        summary.conflicts += 1;
        continue;
      }
      sourcesByPath.set(path, (sourcesByPath.get(path) ?? 0) + 1);
      candidates.push({ file, locale, code, path });
    }
  }

  // Existing language files are known from the listing, so only those are read, a few at once.
  const existing = new Map<string, Buffer>();
  const toRead = [...new Set(candidates.map((candidate) => candidate.path))].filter((path) =>
    input.repositoryPaths.has(path),
  );
  const reads = await mapWithConcurrency(toRead, READ_CONCURRENCY, async (path) => ({
    path,
    result: await input.reader.readFile({ commitSha: input.head.commitSha, path }),
  }));
  for (const read of reads) {
    if (isErr(read.result)) {
      if (read.result.error.code === "content_sync_file_not_found") {
        continue;
      }
      return withError(summary, read.result.error);
    }
    existing.set(read.path, read.result.value);
  }

  const changes: Change[] = [];
  const keysByFile = new Map<GitLabDeliverySourceFile, FileKeys>();
  for (const candidate of candidates) {
    if ((sourcesByPath.get(candidate.path) ?? 0) > 1) {
      // Two source files would write the same language file; neither can be right.
      summary.conflicts += 1;
      continue;
    }
    let keys = keysByFile.get(candidate.file);
    if (!keys) {
      keys = await loadFileKeys(input, candidate.file.projectPath);
      keysByFile.set(candidate.file, keys);
    }
    const current = existing.get(candidate.path) ?? null;
    const built = await buildLanguageFile({
      ...input,
      file: candidate.file,
      format: formats.get(candidate.file)!,
      locale: candidate.locale,
      code: candidate.code,
      keys,
      existing: current,
    });
    if (built.kind === "held_back") {
      summary.heldBack += 1;
    } else if (built.kind === "unreadable") {
      summary.unreadable += 1;
    } else if (built.kind === "unsupported") {
      summary.unsupported += 1;
    } else if (built.kind === "file") {
      summary.listsHeldBack += built.listsHeldBack;
      if (!current || !current.equals(built.content)) {
        changes.push({ path: candidate.path, content: built.content, exists: current !== null });
      }
    }
  }

  const review = await input.writer.findReview({
    sourceBranch: input.branchName,
    targetBranch: input.head.branch,
  });
  if (isErr(review)) {
    return withError(summary, review.error);
  }

  if (changes.length === 0) {
    // Nothing approved differs from the target. A branch that still exists carries text that is
    // no longer approved, so its merge request is closed, with the reason, and the branch dropped.
    if (review.value?.state !== "open") {
      return summary;
    }
    const branch = await input.reader.resolveBranchHead({ branch: input.branchName });
    if (isErr(branch)) {
      return branch.error.code === "content_sync_branch_not_found"
        ? { ...summary, pullRequestUrl: review.value.url }
        : withError(summary, branch.error);
    }
    const closed = await input.writer.closeReview({
      id: review.value.id,
      reason:
        "Closed by Hyperlocalise: nothing approved differs from the target branch any more, so these translations are not to be merged. A later run opens a new merge request when there is something to send.",
    });
    if (isErr(closed)) {
      return withError(summary, closed.error);
    }
    const deleted = await input.writer.deleteBranch(input.branchName);
    return isErr(deleted) ? withError(summary, deleted.error) : summary;
  }

  const fingerprint = fingerprintOf(changes);
  if (
    review.value?.state === "closed" &&
    !review.value.closedBySync &&
    review.value.fingerprint === fingerprint
  ) {
    // A reviewer closed exactly this content: it stays closed until something approved changes.
    return summary;
  }

  const shortRun = input.runId.slice(0, 8);
  const branch = await inspectSyncBranch(input);
  if (isErr(branch)) {
    return withError(summary, branch.error);
  }
  const alreadyThere = branch.value !== null && branchHolds(branch.value, input.head, changes);
  if (!alreadyThere) {
    const commit = await input.writer.commitFiles({
      branch: input.branchName,
      startFrom: input.head,
      message: `chore(i18n): update translations (${shortRun})`,
      changes,
    });
    if (isErr(commit)) {
      return withError(summary, commit.error);
    }
  }
  const upserted = await input.writer.upsertReview({
    sourceBranch: input.branchName,
    targetBranch: input.head.branch,
    title: "chore(i18n): update translations",
    description: [
      "## Hyperlocalise translation sync",
      "",
      "This merge request writes approved Hyperlocalise translations back to the repository. It is rebuilt on each sync run, so make translation fixes in Hyperlocalise rather than here.",
      "",
      `- Language files in this merge request: ${changes.length}`,
      `- Last sync run: ${shortRun}`,
    ].join("\n"),
    fingerprint,
  });
  if (isErr(upserted)) {
    return withError(summary, upserted.error);
  }
  logger.info(
    { projectId: input.projectId, written: alreadyThere ? 0 : changes.length },
    "gitlab content sync delivered translations",
  );
  return {
    ...summary,
    written: alreadyThere ? 0 : changes.length,
    pullRequestUrl: upserted.value.url,
  };
}

function withError(
  summary: GitLabDeliverySummary,
  error: ContentSyncProviderError,
): GitLabDeliverySummary {
  return { ...summary, written: 0, error: { code: error.code, message: error.message } };
}

/**
 * The code a language file is named with: the one the repository already uses for that locale,
 * else the project's tag written the way the repository writes its regional codes (`en_US`,
 * `pt-br`); where the repository has only bare codes, the bare language when the project has one
 * locale of it (the source counted), else the tag as written.
 */
function codeFor(locale: string, localeCodes: Map<string, string>, locales: string[]): string {
  const known = localeCodes.get(locale);
  if (known) {
    return known;
  }
  const samples = [...localeCodes.values()];
  const regional = samples.filter((sample) => /[-_]/.test(sample));
  if (regional.length === 0) {
    const language = locale.split("-")[0]!;
    const ofLanguage = locales.filter((candidate) => candidate.split("-")[0] === language);
    return samples.length > 0 && ofLanguage.length === 1 ? language.toLowerCase() : locale;
  }
  let code = locale;
  if (regional.some((sample) => sample.includes("_"))) {
    code = code.replace(/-/g, "_");
  }
  if (regional.every((sample) => sample === sample.toLowerCase())) {
    code = code.toLowerCase();
  }
  return code;
}

/** Names the content a merge request holds: the sorted paths and their blob ids. */
function fingerprintOf(changes: Change[]): string {
  const lines = changes
    .map((change) => `${change.path}:${gitBlobId(change.content, "sha1")}`)
    .sort();
  return createHash("sha1").update(lines.join("\n")).digest("hex");
}

type SyncBranch = {
  head: ContentSyncBranchHead;
  /** Whether the branch is one commit on the target commit. */
  onTarget: boolean;
  /** The paths the branch's commit adds, changes or removes; empty unless on the target. */
  /** `null` when the commit touches more files than can be listed: it never counts as holding. */
  commitPaths: string[] | null;
  /** Blob ids of the branch's files under the provider folder, by path. */
  blobIds: Map<string, string | null>;
};

/** What the sync branch holds, or null when it doesn't exist. */
async function inspectSyncBranch(
  input: GitLabDeliveryInput,
): Promise<Result<SyncBranch | null, ContentSyncProviderError>> {
  const head = await input.reader.resolveBranchHead({ branch: input.branchName });
  if (isErr(head)) {
    return head.error.code === "content_sync_branch_not_found" ? ok(null) : err(head.error);
  }
  const parents = head.value.parentCommitShas ?? [];
  const onTarget = parents.length === 1 && parents[0] === input.head.commitSha;
  if (!onTarget) {
    // Not on the target, so it is rebuilt whatever it holds; nothing more is asked of GitLab.
    return ok({ head: head.value, onTarget, commitPaths: [], blobIds: new Map() });
  }
  const commitPaths = await input.reader.listCommitPaths({ commitSha: head.value.commitSha });
  if (isErr(commitPaths)) {
    return err(commitPaths.error);
  }
  const files = await input.reader.listFiles({
    commitSha: head.value.commitSha,
    folder: input.syncConfig.providerFolder,
  });
  if (isErr(files)) {
    return err(files.error);
  }
  return ok({
    head: head.value,
    onTarget,
    commitPaths: commitPaths.value,
    blobIds: new Map(files.value.map((file) => [file.path, file.contentId])),
  });
}

/** Git's own id for a file's bytes, so a branch's copy is compared without reading it. */
function gitBlobId(content: Buffer, algorithm: "sha1" | "sha256"): string {
  return createHash(algorithm).update(`blob ${content.length}\0`).update(content).digest("hex");
}

/**
 * Whether the branch is exactly one commit on the target that changes exactly these files to
 * exactly this content, in which case committing again would only repeat it.
 */
function branchHolds(
  branch: SyncBranch,
  target: ContentSyncBranchHead,
  changes: Change[],
): boolean {
  if (!branch.onTarget) {
    return false;
  }
  const wanted = new Set(changes.map((change) => change.path));
  if (
    !branch.commitPaths ||
    branch.commitPaths.length !== wanted.size ||
    branch.commitPaths.some((path) => !wanted.has(path))
  ) {
    return false;
  }
  // A SHA-256 repository lists 64-character ids.
  const algorithm = [...branch.blobIds.values()].some((id) => id?.length === 64)
    ? "sha256"
    : "sha1";
  return changes.every(
    (change) => branch.blobIds.get(change.path) === gitBlobId(change.content, algorithm),
  );
}

type FileKeys = {
  /** Keys the importer made of the file and still has: what is text to translate. */
  known: Set<string>;
  /** Keys the sync hid because the repository dropped them. */
  dropped: Set<string>;
  /** Keys someone hid by hand: left as the file or the source has them. */
  hidden: Set<string>;
};

async function loadFileKeys(
  input: { organizationId: string; projectId: string },
  projectPath: string,
): Promise<FileKeys> {
  const rows = await db
    .select({
      key: schema.projectTranslationKeys.key,
      isHidden: schema.projectTranslationKeys.isHidden,
      hiddenBySyncAt: schema.projectTranslationKeys.hiddenBySyncAt,
    })
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
      ),
    );
  const dropped = rows.filter((row) => row.hiddenBySyncAt !== null);
  return {
    known: new Set(rows.filter((row) => row.hiddenBySyncAt === null).map((row) => row.key)),
    dropped: new Set(dropped.map((row) => row.key)),
    hidden: new Set(
      rows.filter((row) => row.isHidden && row.hiddenBySyncAt === null).map((row) => row.key),
    ),
  };
}

type BuiltFile =
  | { kind: "file"; content: Buffer; listsHeldBack: number }
  | { kind: "held_back" }
  | { kind: "unchanged" }
  | { kind: "unreadable" }
  | { kind: "unsupported" };

async function buildLanguageFile(input: {
  organizationId: string;
  projectId: string;
  file: GitLabDeliverySourceFile;
  format: "json" | "html";
  locale: string;
  code: string;
  keys: FileKeys;
  existing: Buffer | null;
}): Promise<BuiltFile> {
  const loaded = await loadProjectTranslationsAsPrefilledEntries({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.file.projectPath,
    targetLocale: input.locale,
    readyTranslationsOnly: true,
    approvedTranslationsOnly: true,
  });
  // Keys the repository dropped are never written back; keys hidden by hand aren't text to
  // translate, so their approved text, if any, stays out too.
  const approved: Record<string, string> = {};
  for (const [key, text] of Object.entries(loaded.prefilled)) {
    if (!input.keys.dropped.has(key) && !input.keys.hidden.has(key)) {
      approved[key] = text;
    }
  }
  const approvedCount = Object.keys(approved).length;

  if (input.format === "html") {
    // A page is one document: it goes out whole, once every segment that is text to translate
    // is approved.
    if (approvedCount === 0) {
      return { kind: "unchanged" };
    }
    const translatable = loaded.loadedKeyCount - input.keys.dropped.size - input.keys.hidden.size;
    if (approvedCount < translatable) {
      return { kind: "held_back" };
    }
    const download = await loadProjectHtmlTranslationDownload({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.file.projectPath,
      targetLocale: input.locale,
      approvedTranslationsOnly: true,
      omitKeys: input.keys.hidden,
    });
    if (isErr(download) || !download.value) {
      return { kind: "unreadable" };
    }
    return { kind: "file", content: download.value.content, listsHeldBack: 0 };
  }

  if (approvedCount === 0) {
    return { kind: "unchanged" };
  }
  return buildContentSyncJsonTranslationFile({
    source: input.file.content,
    existing: input.existing,
    approved,
    knownKeys: input.keys.known,
    droppedKeys: input.keys.dropped,
    hiddenKeys: input.keys.hidden,
    ...(input.file.relativePath.toLowerCase().endsWith(".arb") ? { arbLocale: input.code } : {}),
  });
}
