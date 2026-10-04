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
import { and, asc, count, eq, gt, inArray, lt, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import { loadProjectGlossaryTerms } from "@/lib/providers/provider-job-qa/load-glossary-terms";
import type { TranslationQaScanQueue } from "@/lib/workflow/types";

import { emptyTranslationQaSummary } from "./qa-report-store";
import {
  translationQaCheckTypes,
  type TranslationQaCheckType,
  type TranslationQaRunTrigger,
  type TranslationQaSeverity,
} from "./types";
import { QA_CHECK_VERSION, validateScanSegment } from "./scan-segment-validation";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { capResolvedSpellcheckWords } from "@/lib/spellcheck-dictionary/normalize-word";
import { DEFAULT_QA_POLICY, type QaCheckPolicy } from "./qa-policy";
import { QaCliUnavailableError, validateQaPageInSandbox } from "./validate-page-in-sandbox";

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
    logger.error(
      { runId: run.runId, projectId: input.projectId, errorType: qaScanErrorType(error) },
      "translation qa scan could not be queued",
    );
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
  let failureCode = "qa_scan_processing_failed";
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

    failureCode = "qa_scan_finalization_failed";
    await completeTranslationQaScan(input);
  } catch (error) {
    await failTranslationQaRun({
      runId: input.runId,
      errorCode: failureCode,
      errorMessage: error instanceof Error ? error.message : "qa scan failed",
    });
    logger.error(
      {
        runId: input.runId,
        projectId: input.projectId,
        failureCode,
        errorType: qaScanErrorType(error),
      },
      "translation qa scan failed",
    );
    throw error;
  }
}

function qaScanErrorType(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
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

  const wordRows = await db.execute<{ locale: string; word: string }>(sql`
      select w.locale, w.word from project_spellcheck_word_libraries p
      join spellcheck_word_libraries d on d.id = p.library_id and d.status = 'active'
      join spellcheck_word_library_words w on w.library_id = d.id
      where p.organization_id = ${input.organizationId} and p.project_id = ${input.projectId}
      order by p.priority, w.created_at, w.id`);
  const acceptedWordsByLocale = acceptedSpellcheckWordsByLocale(wordRows.rows);
  const skippedChecksByLocale: Record<string, string[]> = {};
  const requests = keys.flatMap((key) => locales.map((targetLocale) => ({ key, targetLocale })));
  const policy = run.checkPolicy ?? DEFAULT_QA_POLICY;
  const segments = requests.map(({ key, targetLocale }, index) => {
    const translation = translationByKeyLocale.get(`${key.translationKeyId}\0${targetLocale}`);
    return {
      id: String(index),
      sourceText: key.sourceText,
      targetText: translation?.text ?? "",
      sourcePath: key.sourcePath ?? "",
      maxLength: key.maxLength ?? 0,
      targetLocale,
    };
  });
  let results: Awaited<ReturnType<typeof validateQaPageInSandbox>>;
  try {
    results = await validateQaPageInSandbox({
      policy,
      glossaryTerms,
      acceptedWordsByLocale: Object.fromEntries(acceptedWordsByLocale),
      segments,
    });
  } catch (error) {
    if (!(error instanceof QaCliUnavailableError)) throw error;
    logger.warn(
      { runId: input.runId, projectId: input.projectId },
      "QA CLI is not available in sandbox",
    );
    results = await mapWithConcurrency(segments, 8, async (segment) => {
      const { checks, skippedChecks } = await validateScanSegment(
        { ...segment, glossaryTerms },
        acceptedWordsByLocale.get(normalizeQaSpellcheckLocale(segment.targetLocale)) ?? [],
        policy,
      );
      return { id: segment.id, checks, skippedChecks };
    });
  }
  for (const [index, { key, targetLocale }] of requests.entries()) {
    const translation = translationByKeyLocale.get(`${key.translationKeyId}\0${targetLocale}`);
    const targetText = translation?.text ?? "";
    const { checks, skippedChecks = [] } = results[index] ?? { checks: [], skippedChecks: [] };
    if (skippedChecks.length) skippedChecksByLocale[targetLocale] = skippedChecks;
    for (const check of checks) {
      if (!translationQaCheckTypes.includes(check.checkType as TranslationQaCheckType)) {
        throw new Error("QA CLI returned an unknown check type");
      }
      pendingFindings.push({
        runId: input.runId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        translationKeyId: key.translationKeyId,
        translationId: translation?.id ?? null,
        sourcePath: key.sourcePath,
        key: key.key,
        targetLocale,
        checkType: check.checkType as TranslationQaCheckType,
        severity: check.severity,
        category: check.category,
        message: check.message,
        relatedTokens: check.relatedTokens,
        sourceText: key.sourceText,
        targetText,
        ruleVersion: QA_CHECK_VERSION,
      });
      if (pendingFindings.length >= FINDING_INSERT_CHUNK) await flushFindings();
    }
  }
  await db.execute(sql`update translation_qa_runs set summary = jsonb_set(summary, '{skippedChecksByLocale}',
      coalesce(summary->'skippedChecksByLocale', '{}'::jsonb) || ${JSON.stringify(skippedChecksByLocale)}::jsonb)
      where id = ${input.runId}`);

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

  // Carry exceptions only for the exact text, rule version and diagnostic. A changed
  // translation or rule automatically returns to the review queue.
  await db.execute(sql`update translation_qa_findings f set status = 'ignored',
      ignore_reason = previous.ignore_reason, reviewed_at = previous.reviewed_at,
      reviewed_by_user_id = previous.reviewed_by_user_id
      from translation_qa_findings previous
      where f.run_id = ${input.runId} and previous.run_id <> f.run_id
      and previous.organization_id = f.organization_id and previous.project_id = f.project_id
      and previous.translation_key_id = f.translation_key_id and previous.target_locale = f.target_locale
      and previous.check_type = f.check_type and previous.message = f.message
      and previous.source_text = f.source_text and previous.target_text = f.target_text
      and previous.rule_version = f.rule_version and previous.status = 'ignored'`);
  const completedAt = new Date();
  const updated = await db
    .update(schema.translationQaRuns)
    .set({
      status: "succeeded",
      segmentCount: (keyCountRow?.value ?? 0) * locales.length,
      findingCount: findingRows.length,
      errorCount,
      warningCount,
      summary: {
        byCheckType,
        bySeverity,
        byLocale,
        checkVersion: QA_CHECK_VERSION,
        skippedChecksByLocale: run.summary.skippedChecksByLocale ?? {},
      },
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

  // Older snapshots become fixed only after this run rechecked that check and
  // no longer finds it. Disabled policy checks were not rechecked, including
  // spelling turned off in policy. Skipped spelling was not rechecked either.
  const disabledCheckTypes = disabledQaCheckTypes(run.checkPolicy);
  await db.execute(sql`update translation_qa_findings old set status = 'resolved', reviewed_at = ${completedAt}
      where old.organization_id = ${input.organizationId} and old.project_id = ${input.projectId}
      and old.run_id <> ${input.runId} and old.status = 'open'
      and not (${JSON.stringify(disabledCheckTypes)}::jsonb ? old.check_type)
      and not (old.check_type = 'spelling' and ${JSON.stringify(run.summary.skippedChecksByLocale ?? {})}::jsonb ? old.target_locale)
      and not exists (select 1 from translation_qa_findings current
          where current.run_id = ${input.runId} and current.translation_key_id = old.translation_key_id
          and current.target_locale = old.target_locale and current.check_type = old.check_type)`);
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

  const reclaimed = await db
    .update(schema.translationQaRuns)
    .set({
      status: "failed",
      errorCode: "qa_scan_stale",
      errorMessage: "Scan did not finish before the lease expired.",
      completedAt: new Date(),
    })
    .where(and(...filters))
    .returning({
      runId: schema.translationQaRuns.id,
      projectId: schema.translationQaRuns.projectId,
    });
  for (const run of reclaimed) {
    logger.error(
      { runId: run.runId, projectId: run.projectId, failureCode: "qa_scan_stale" },
      "translation qa scan timed out",
    );
  }
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
    const [projectPolicy] = await db
      .select({ policy: schema.projects.qaCheckPolicy })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, input.projectId),
          eq(schema.projects.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    const [run] = await db
      .insert(schema.translationQaRuns)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        trigger: input.trigger,
        checkPolicy: projectPolicy?.policy ?? DEFAULT_QA_POLICY,
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
    .select({
      id: schema.translationQaRuns.id,
      summary: schema.translationQaRuns.summary,
      checkPolicy: schema.translationQaRuns.checkPolicy,
    })
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

function disabledQaCheckTypes(policy: QaCheckPolicy | null | undefined) {
  const resolved = policy ? { ...DEFAULT_QA_POLICY, ...policy } : DEFAULT_QA_POLICY;
  return translationQaCheckTypes.filter((checkType) => !resolved[checkType].enabled);
}

function normalizeQaSpellcheckLocale(locale: string) {
  return locale.toLowerCase().replaceAll("_", "-");
}

function acceptedSpellcheckWordsByLocale(rows: readonly { locale: string; word: string }[]) {
  const wordsByLocale = new Map<string, string[]>();
  const seenByLocale = new Map<string, Set<string>>();
  for (const row of rows) {
    const locale = normalizeQaSpellcheckLocale(row.locale);
    let words = wordsByLocale.get(locale);
    let seen = seenByLocale.get(locale);
    if (!words || !seen) {
      words = [];
      seen = new Set();
      wordsByLocale.set(locale, words);
      seenByLocale.set(locale, seen);
    }
    if (seen.has(row.word)) continue;
    seen.add(row.word);
    words.push(row.word);
  }

  const accepted = new Map<string, string[]>();
  for (const [locale, words] of wordsByLocale) {
    accepted.set(locale, capResolvedSpellcheckWords(words));
  }
  return accepted;
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
