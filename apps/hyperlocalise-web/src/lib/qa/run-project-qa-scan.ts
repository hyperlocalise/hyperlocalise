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
import { and, asc, count, eq, gt, inArray, lt } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import { loadProjectGlossaryTerms } from "@/lib/providers/provider-job-qa/load-glossary-terms";
import type { TranslationQaScanQueue } from "@/lib/workflow/types";

import { emptyTranslationQaSummary } from "./qa-report-store";
import type {
  TranslationQaCheckType,
  TranslationQaRunTrigger,
  TranslationQaSeverity,
} from "./types";
import { validateTranslationSegment } from "./validate-segment";

const logger = createLogger("translation-qa-scan");
export const KEY_PAGE_SIZE = 250;
const FINDING_INSERT_CHUNK = 100;
const MAX_SCAN_PAGES = 50_000;
/** No page progress for this long means the workflow died and the row can be reclaimed. */
export const STALE_RUNNING_SCAN_MS = 30 * 60 * 1000;

type QaScanKeyRow = {
  translationKeyId: string;
  key: string;
  sourceText: string;
  maxLength: number | null;
  sourcePath: string | null;
};

type NativeQaProject = {
  id: string;
  sourceLocale: string;
  targetLocales: string[];
};

export type TranslationQaScanResult =
  | { ok: true; runId: string }
  | { ok: false; code: "project_not_native" | "scan_in_progress" | "project_not_found" };

export type TranslationQaScanPageResult = { done: true } | { done: false; afterKeyId: string };

export async function startTranslationQaScan(input: {
  organizationId: string;
  projectId: string;
  trigger: TranslationQaRunTrigger;
  createdByUserId?: string | null;
  queue: TranslationQaScanQueue;
}): Promise<TranslationQaScanResult> {
  const project = await loadNativeQaProject(input);
  if (!project.ok) {
    return project;
  }

  const run = await claimTranslationQaRun(input);
  if (!run.ok) {
    return run;
  }

  try {
    await input.queue.enqueue({
      runId: run.runId,
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
    return run;
  } catch (error) {
    await failTranslationQaRun({
      runId: run.runId,
      errorCode: "qa_scan_enqueue_failed",
      errorMessage: error instanceof Error ? error.message : "qa scan could not be queued",
    });
    throw error;
  }
}

export async function runProjectTranslationQaScan(input: {
  organizationId: string;
  projectId: string;
  trigger: TranslationQaRunTrigger;
  createdByUserId?: string | null;
}): Promise<TranslationQaScanResult> {
  const project = await loadNativeQaProject(input);
  if (!project.ok) {
    return project;
  }

  const run = await claimTranslationQaRun(input);
  if (!run.ok) {
    return run;
  }

  await executeTranslationQaScan({
    runId: run.runId,
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  return run;
}

export async function executeTranslationQaScan(input: {
  runId: string;
  organizationId: string;
  projectId: string;
}) {
  try {
    let afterKeyId: string | null = null;
    for (let page = 0; page < MAX_SCAN_PAGES; page += 1) {
      const result = await scanTranslationQaPage({
        ...input,
        afterKeyId,
      });
      if (result.done) {
        break;
      }
      afterKeyId = result.afterKeyId;
    }

    await completeTranslationQaScan(input);
  } catch (error) {
    await failTranslationQaRun({
      runId: input.runId,
      errorCode: "qa_scan_failed",
      errorMessage: error instanceof Error ? error.message : "qa scan failed",
    });
    logger.info({ runId: input.runId, projectId: input.projectId }, "translation qa scan failed");
    throw error;
  }
}

export async function scanTranslationQaPage(input: {
  runId: string;
  organizationId: string;
  projectId: string;
  afterKeyId: string | null;
}): Promise<TranslationQaScanPageResult> {
  const run = await loadRunningQaScan(input.runId);
  if (!run) {
    return { done: true };
  }

  const project = await loadNativeQaProject(input);
  if (!project.ok) {
    throw new Error(project.code);
  }

  const locales = uniqueSortedLocales(project.targetLocales);
  const glossaryTerms = await loadProjectGlossaryTerms({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourceLocale: project.sourceLocale,
    targetLocales: project.targetLocales,
  });

  const keys: QaScanKeyRow[] = await db
    .select({
      translationKeyId: schema.projectTranslationKeys.id,
      key: schema.projectTranslationKeys.key,
      sourceText: schema.projectTranslationKeys.sourceText,
      maxLength: schema.projectTranslationKeys.maxLength,
      sourcePath: schema.repositorySourceFiles.sourcePath,
    })
    .from(schema.projectTranslationKeys)
    .leftJoin(
      schema.repositorySourceFiles,
      eq(schema.projectTranslationKeys.repositorySourceFileId, schema.repositorySourceFiles.id),
    )
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, input.organizationId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.projectTranslationKeys.isHidden, false),
        input.afterKeyId ? gt(schema.projectTranslationKeys.id, input.afterKeyId) : undefined,
      ),
    )
    .orderBy(asc(schema.projectTranslationKeys.id))
    .limit(KEY_PAGE_SIZE);

  if (keys.length === 0) {
    return { done: true };
  }

  const keyIds = keys.map((row) => row.translationKeyId);
  await db
    .delete(schema.translationQaFindings)
    .where(
      and(
        eq(schema.translationQaFindings.runId, input.runId),
        inArray(schema.translationQaFindings.translationKeyId, keyIds),
      ),
    );

  const translations =
    locales.length === 0
      ? []
      : await db
          .select({
            id: schema.projectTranslations.id,
            translationKeyId: schema.projectTranslations.translationKeyId,
            targetLocale: schema.projectTranslations.targetLocale,
            text: schema.projectTranslations.text,
          })
          .from(schema.projectTranslations)
          .where(
            and(
              eq(schema.projectTranslations.organizationId, input.organizationId),
              eq(schema.projectTranslations.projectId, input.projectId),
              inArray(schema.projectTranslations.translationKeyId, keyIds),
              inArray(schema.projectTranslations.targetLocale, locales),
            ),
          );

  const translationByKeyLocale = new Map(
    translations.map((row) => [`${row.translationKeyId}\0${row.targetLocale}`, row]),
  );

  let pendingFindings: Array<typeof schema.translationQaFindings.$inferInsert> = [];

  async function flushFindings() {
    if (pendingFindings.length === 0) {
      return;
    }
    await db.insert(schema.translationQaFindings).values(pendingFindings);
    pendingFindings = [];
  }

  for (const key of keys) {
    for (const targetLocale of locales) {
      const translation = translationByKeyLocale.get(`${key.translationKeyId}\0${targetLocale}`);
      const targetText = translation?.text ?? "";
      const checks = validateTranslationSegment({
        sourceText: key.sourceText,
        targetText,
        sourcePath: key.sourcePath,
        maxLength: key.maxLength,
        targetLocale,
        glossaryTerms,
      });

      for (const check of checks) {
        pendingFindings.push({
          runId: input.runId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          translationKeyId: key.translationKeyId,
          translationId: translation?.id ?? null,
          sourcePath: key.sourcePath,
          key: key.key,
          targetLocale,
          checkType: check.checkType,
          severity: check.severity,
          category: check.category,
          message: check.message,
          relatedTokens: check.relatedTokens,
          sourceText: key.sourceText,
          targetText,
        });
        if (pendingFindings.length >= FINDING_INSERT_CHUNK) {
          await flushFindings();
        }
      }
    }
  }

  await flushFindings();
  await touchTranslationQaRun(input.runId);

  const afterKeyId = keys[keys.length - 1]?.translationKeyId;
  if (!afterKeyId || keys.length < KEY_PAGE_SIZE) {
    return { done: true };
  }
  return { done: false, afterKeyId };
}

export async function completeTranslationQaScan(input: {
  runId: string;
  organizationId: string;
  projectId: string;
}) {
  const run = await loadRunningQaScan(input.runId);
  if (!run) {
    return { ok: true as const, alreadyCompleted: true as const };
  }

  const project = await loadNativeQaProject(input);
  if (!project.ok) {
    throw new Error(project.code);
  }

  const locales = uniqueSortedLocales(project.targetLocales);
  const [keyCountRow] = await db
    .select({ value: count() })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, input.organizationId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.projectTranslationKeys.isHidden, false),
      ),
    );

  const findingRows = await db
    .select({
      checkType: schema.translationQaFindings.checkType,
      severity: schema.translationQaFindings.severity,
      targetLocale: schema.translationQaFindings.targetLocale,
    })
    .from(schema.translationQaFindings)
    .where(eq(schema.translationQaFindings.runId, input.runId));

  const byCheckType: Partial<Record<TranslationQaCheckType, number>> = {};
  const bySeverity: Partial<Record<TranslationQaSeverity, number>> = {};
  const byLocale: Record<string, number> = {};
  let errorCount = 0;
  let warningCount = 0;

  for (const row of findingRows) {
    const checkType = row.checkType as TranslationQaCheckType;
    const severity = row.severity as TranslationQaSeverity;
    byCheckType[checkType] = (byCheckType[checkType] ?? 0) + 1;
    bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;
    byLocale[row.targetLocale] = (byLocale[row.targetLocale] ?? 0) + 1;
    if (severity === "error") {
      errorCount += 1;
    } else {
      warningCount += 1;
    }
  }

  const completedAt = new Date();
  const updated = await db
    .update(schema.translationQaRuns)
    .set({
      status: "succeeded",
      segmentCount: (keyCountRow?.value ?? 0) * locales.length,
      findingCount: findingRows.length,
      errorCount,
      warningCount,
      summary: { byCheckType, bySeverity, byLocale },
      completedAt,
    })
    .where(
      and(
        eq(schema.translationQaRuns.id, input.runId),
        eq(schema.translationQaRuns.status, "running"),
      ),
    )
    .returning({ id: schema.translationQaRuns.id });

  if (updated.length === 0) {
    return { ok: true as const, alreadyCompleted: true as const };
  }

  await db
    .update(schema.projects)
    .set({ qaScanLastRunAt: completedAt })
    .where(
      and(
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.id, input.projectId),
      ),
    );

  logger.info(
    {
      runId: input.runId,
      projectId: input.projectId,
      segmentCount: (keyCountRow?.value ?? 0) * locales.length,
      findingCount: findingRows.length,
    },
    "translation qa scan completed",
  );

  return { ok: true as const, alreadyCompleted: false as const };
}

export async function failTranslationQaRun(input: {
  runId: string;
  errorCode: string;
  errorMessage: string;
}) {
  await db
    .update(schema.translationQaRuns)
    .set({
      status: "failed",
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.translationQaRuns.id, input.runId),
        eq(schema.translationQaRuns.status, "running"),
      ),
    );
}

export async function reclaimStaleTranslationQaRuns(input?: {
  organizationId?: string;
  projectId?: string;
}) {
  const cutoff = new Date(Date.now() - STALE_RUNNING_SCAN_MS);
  const filters = [
    eq(schema.translationQaRuns.status, "running"),
    lt(schema.translationQaRuns.updatedAt, cutoff),
  ];
  if (input?.organizationId) {
    filters.push(eq(schema.translationQaRuns.organizationId, input.organizationId));
  }
  if (input?.projectId) {
    filters.push(eq(schema.translationQaRuns.projectId, input.projectId));
  }

  await db
    .update(schema.translationQaRuns)
    .set({
      status: "failed",
      errorCode: "qa_scan_stale",
      errorMessage: "Scan did not finish before the lease expired.",
      completedAt: new Date(),
    })
    .where(and(...filters));
}

export async function claimTranslationQaRun(input: {
  organizationId: string;
  projectId: string;
  trigger: TranslationQaRunTrigger;
  createdByUserId?: string | null;
}): Promise<TranslationQaScanResult> {
  await reclaimStaleTranslationQaRuns({
    organizationId: input.organizationId,
    projectId: input.projectId,
  });

  try {
    const [run] = await db
      .insert(schema.translationQaRuns)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        trigger: input.trigger,
        status: "running",
        createdByUserId: input.createdByUserId ?? null,
        summary: emptyTranslationQaSummary(),
        startedAt: new Date(),
      })
      .returning({ id: schema.translationQaRuns.id });

    if (!run) {
      return { ok: false, code: "project_not_found" };
    }
    return { ok: true, runId: run.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, code: "scan_in_progress" };
    }
    throw error;
  }
}

async function loadNativeQaProject(input: {
  organizationId: string;
  projectId: string;
}): Promise<
  ({ ok: true } & NativeQaProject) | { ok: false; code: "project_not_native" | "project_not_found" }
> {
  const [project] = await db
    .select({
      id: schema.projects.id,
      source: schema.projects.source,
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
    return { ok: false, code: "project_not_found" };
  }
  if (project.source !== "native") {
    return { ok: false, code: "project_not_native" };
  }
  return {
    ok: true,
    id: project.id,
    sourceLocale: project.sourceLocale ?? "",
    targetLocales: project.targetLocales,
  };
}

async function loadRunningQaScan(runId: string) {
  const [run] = await db
    .select({ id: schema.translationQaRuns.id })
    .from(schema.translationQaRuns)
    .where(
      and(eq(schema.translationQaRuns.id, runId), eq(schema.translationQaRuns.status, "running")),
    )
    .limit(1);
  return run ?? null;
}

async function touchTranslationQaRun(runId: string) {
  await db
    .update(schema.translationQaRuns)
    .set({ updatedAt: new Date() })
    .where(
      and(eq(schema.translationQaRuns.id, runId), eq(schema.translationQaRuns.status, "running")),
    );
}

function uniqueSortedLocales(locales: readonly string[]) {
  return [...new Set(locales)].toSorted();
}

function isUniqueViolation(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  if ("code" in error && error.code === "23505") {
    return true;
  }
  const cause = "cause" in error ? error.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}
