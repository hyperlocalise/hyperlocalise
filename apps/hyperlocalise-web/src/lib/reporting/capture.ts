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
import { and, asc, eq, desc, gt, inArray, isNull, sql } from "drizzle-orm";
import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { listAttachedProjectMemoryIds } from "@/lib/memory/ensure-default-native-project-memory";
import { countSourceWords, matchBucket } from "./word-analysis";
import { MemoryMatchIndex, MemorySourceScan, sourceSimilarity } from "./memory-match-index";
import { wordCost } from "./money";

export { sourceSimilarity };

const REPORTING_BATCH_SIZE = 500;
/**
 * Memory entries loaded and indexed at a time. A larger memory is scored one slice after another,
 * keeping each string's best score. The index takes about 1.5 MB per 1,000 entries, and several
 * jobs can share one function instance, so this keeps a few concurrent jobs well inside a 2 GB
 * function.
 */
const MEMORY_SLICE_ENTRIES = 300_000;
/**
 * Below this many strings a plain scan of the entries per string is cheaper than building the
 * index: building costs about as much as two or three scans over the same entries.
 */
const MEMORY_INDEX_MIN_QUERIES = 4;
/** Version 2: scores come from the in-memory bigram index on normalized text. */
export const MATCH_ALGORITHM_VERSION = 2;

export async function reportingStart(database: DatabaseClient = db) {
  await database.insert(schema.reportingRollout).values({ id: 1 }).onConflictDoNothing();
  const [rollout] = await database.select().from(schema.reportingRollout).limit(1);
  return rollout.startedAt;
}

export async function isWorkspaceReportsCaptureEnabled(organizationId: string): Promise<boolean> {
  try {
    const { resolveWorkspaceReportsFlag } = await import("@/lib/flags/workspace-flags");
    return await resolveWorkspaceReportsFlag({ organizationId });
  } catch {
    return false;
  }
}

export async function resolveReportingRate(
  input: {
    organizationId: string;
    projectId: string;
    jobId?: string;
    sourceLocale: string;
    targetLocale: string;
    step: "translation" | "review";
  },
  database: DatabaseClient = db,
) {
  const [override] = input.jobId
    ? await database
        .select()
        .from(schema.reportingTaskRates)
        .where(
          and(
            eq(schema.reportingTaskRates.organizationId, input.organizationId),
            eq(schema.reportingTaskRates.jobId, input.jobId),
            eq(schema.reportingTaskRates.step, input.step),
          ),
        )
    : [];
  if (override?.rateId) {
    const [rate] = await database
      .select()
      .from(schema.reportingRates)
      .where(
        and(
          eq(schema.reportingRates.id, override.rateId),
          eq(schema.reportingRates.organizationId, input.organizationId),
        ),
      );
    return rate ?? null;
  }
  const [budget] = await database
    .select()
    .from(schema.reportingBudgets)
    .where(
      and(
        eq(schema.reportingBudgets.organizationId, input.organizationId),
        eq(schema.reportingBudgets.projectId, input.projectId),
      ),
    );
  if (!budget?.rateCardName) return null;
  const [rate] = await database
    .select()
    .from(schema.reportingRates)
    .where(
      and(
        eq(schema.reportingRates.organizationId, input.organizationId),
        eq(schema.reportingRates.name, budget.rateCardName),
        eq(schema.reportingRates.sourceLocale, input.sourceLocale),
        eq(schema.reportingRates.targetLocale, input.targetLocale),
        eq(schema.reportingRates.step, input.step),
      ),
    )
    .orderBy(desc(schema.reportingRates.createdAt), desc(schema.reportingRates.id))
    .limit(1);
  return rate ?? null;
}

type LoadedMemory = {
  key: string;
  sources: string[];
  scan?: MemorySourceScan;
  index?: MemoryMatchIndex;
};

/**
 * Keeps the memory a run loaded last, so groups of saves that share a memory load it once. It
 * holds one memory at a time, and only one that fits in a single slice, to bound memory use.
 */
export class MemoryScoreCache {
  loaded: LoadedMemory | null = null;
}

/**
 * Scores each source text against the locale pair's approved memory entries, 0 to 100. Entries are
 * loaded and scored in memory, a slice at a time for a memory larger than one slice. A handful of
 * strings are scanned against the entries instead of indexing them, with the same scores.
 */
export async function scoreAgainstMemory(
  input: {
    memoryIds: string[];
    sourceLocale: string;
    targetLocale: string;
    sourceTexts: string[];
  },
  options: { sliceEntries?: number; cache?: MemoryScoreCache } = {},
): Promise<Map<string, number>> {
  const texts = [...new Set(input.sourceTexts)];
  const scores = new Map(texts.map((text) => [text, 0]));
  if (!input.memoryIds.length || texts.length === 0) return scores;
  const sliceEntries = options.sliceEntries ?? MEMORY_SLICE_ENTRIES;
  const key = [[...input.memoryIds].sort().join(","), input.sourceLocale, input.targetLocale].join(
    "|",
  );
  const score = (memory: LoadedMemory) => {
    const scorer =
      texts.length < MEMORY_INDEX_MIN_QUERIES
        ? (memory.scan ??= new MemorySourceScan(memory.sources))
        : (memory.index ??= new MemoryMatchIndex(memory.sources));
    for (const text of texts) {
      scores.set(text, Math.max(scores.get(text)!, scorer.bestScore(text)));
    }
  };
  if (options.cache?.loaded?.key === key) {
    score(options.cache.loaded);
    return scores;
  }
  let after: string | undefined;
  for (;;) {
    const rows = await db
      .select({ id: schema.memoryEntries.id, source: schema.memoryEntries.normalizedSourceText })
      .from(schema.memoryEntries)
      .where(
        and(approvedMemoryEntries(input), after ? gt(schema.memoryEntries.id, after) : undefined),
      )
      .orderBy(asc(schema.memoryEntries.id))
      .limit(sliceEntries);
    const memory: LoadedMemory = { key, sources: rows.map((row) => row.source) };
    score(memory);
    if (rows.length < sliceEntries) {
      if (after === undefined && options.cache) options.cache.loaded = memory;
      return scores;
    }
    after = rows[rows.length - 1].id;
  }
}

function approvedMemoryEntries(input: {
  memoryIds: string[];
  sourceLocale: string;
  targetLocale: string;
}) {
  return and(
    inArray(schema.memoryEntries.memoryId, input.memoryIds),
    eq(schema.memoryEntries.sourceLocale, input.sourceLocale),
    eq(schema.memoryEntries.targetLocale, input.targetLocale),
    eq(schema.memoryEntries.reviewStatus, "approved"),
  );
}

type AnalysisInput = {
  organizationId: string;
  projectId: string;
  jobId?: string;
  sourceLocale: string;
  targetLocale: string;
  sourceEntries: Record<string, string>;
  step?: "translation" | "review";
  billable?: boolean;
};

/**
 * Options for a caller that has already checked the Reports flag and must know when a write fails,
 * such as the scheduled capture task: `strict` skips the flag check and throws instead of logging.
 */
type StrictWriteOptions = { strict?: boolean };

export async function captureAnalysis(input: AnalysisInput) {
  try {
    await writeReportingAnalysis(input);
  } catch (error) {
    console.warn("reporting_analysis_failed", { jobId: input.jobId, error });
  }
}

/** Writes an analysis like `captureAnalysis`, but throws on failure and skips the flag check. */
export async function recordAnalysis(
  input: AnalysisInput,
  options: { memoryCache?: MemoryScoreCache } = {},
) {
  await writeReportingAnalysis(input, { ...options, strict: true });
}

async function writeReportingAnalysis(
  input: AnalysisInput,
  options: StrictWriteOptions & { memoryCache?: MemoryScoreCache } = {},
) {
  if (!options.strict && !(await isWorkspaceReportsCaptureEnabled(input.organizationId))) {
    return;
  }
  await reportingStart();
  if (input.jobId) {
    const [job] = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
      .where(
        and(
          eq(schema.jobs.id, input.jobId),
          eq(schema.jobs.organizationId, input.organizationId),
          eq(schema.jobs.projectId, input.projectId),
          isNull(schema.externalJobDetails.jobId),
        ),
      );
    if (!job) return;
  }
  const step = input.step ?? "translation";
  const rate = await resolveReportingRate({ ...input, step });
  let memoryIds: string[] | null = null;
  try {
    memoryIds = await listAttachedProjectMemoryIds(input.projectId);
  } catch (error) {
    if (options.strict) throw error;
    console.warn("reporting_match_analysis_unavailable", { jobId: input.jobId });
  }
  const uniqueTexts = [...new Set(Object.values(input.sourceEntries))];
  const scores = new Map<string, number | null>();
  if (memoryIds) {
    try {
      const memoryScores = await scoreAgainstMemory(
        {
          memoryIds,
          sourceLocale: input.sourceLocale,
          targetLocale: input.targetLocale,
          sourceTexts: uniqueTexts,
        },
        { cache: options.memoryCache },
      );
      for (const [sourceText, score] of memoryScores) scores.set(sourceText, score);
    } catch (error) {
      if (options.strict) throw error;
      console.warn("reporting_match_analysis_unavailable", { jobId: input.jobId });
    }
  }
  const revisionOf = (sourceText: string) => createHash("sha256").update(sourceText).digest("hex");
  const recordedEarlier = await revisionsRecordedEarlier({
    ...input,
    step,
    segmentIds: Object.keys(input.sourceEntries),
    revisions: uniqueTexts.map(revisionOf),
  });
  const seen = new Set<string>();
  const rows = Object.entries(input.sourceEntries).map(([segmentId, sourceText]) => {
    const normalized = sourceText.normalize("NFC").trim();
    const sourceRevision = revisionOf(sourceText);
    const repetition = seen.has(normalized) || recordedEarlier.has(sourceRevision);
    seen.add(normalized);
    const score = memoryIds ? (scores.get(sourceText) ?? null) : null;
    return {
      organizationId: input.organizationId,
      projectId: input.projectId,
      jobId: input.jobId ?? null,
      step,
      segmentId,
      sourceRevision,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      words: countSourceWords(sourceText, input.sourceLocale),
      billable: input.billable ?? false,
      matchScore: score,
      bucket: matchBucket(score, repetition),
      algorithmVersion: MATCH_ALGORITHM_VERSION,
      rateId: rate?.id,
    };
  });
  // The unique index on the analysis identity makes concurrent writes safe, so the job row is
  // not locked: a lock here made every writer for a job, including content editor saves, queue.
  await db.transaction(async (tx) => {
    for (let offset = 0; offset < rows.length; offset += REPORTING_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + REPORTING_BATCH_SIZE);
      await tx
        .update(schema.reportingAnalyses)
        .set({ isCurrent: false })
        .where(
          and(
            input.jobId
              ? eq(schema.reportingAnalyses.jobId, input.jobId)
              : isNull(schema.reportingAnalyses.jobId),
            eq(schema.reportingAnalyses.organizationId, input.organizationId),
            inArray(
              schema.reportingAnalyses.segmentId,
              batch.map((row) => row.segmentId),
            ),
            eq(schema.reportingAnalyses.targetLocale, input.targetLocale),
            eq(schema.reportingAnalyses.step, step),
          ),
        );
      await tx
        .insert(schema.reportingAnalyses)
        .values(batch)
        .onConflictDoUpdate({
          target: [
            schema.reportingAnalyses.organizationId,
            schema.reportingAnalyses.jobId,
            schema.reportingAnalyses.segmentId,
            schema.reportingAnalyses.sourceRevision,
            schema.reportingAnalyses.targetLocale,
            schema.reportingAnalyses.step,
          ],
          set: { isCurrent: true, ...(input.billable ? { billable: true } : {}) },
        });
    }
  });
}

/**
 * Source revisions that already have a current analysis under another segment of the same job (or,
 * outside a job, the same project), language and step. A copy recorded earlier makes this one a
 * repetition, even when the two were saved and recorded in different runs.
 */
async function revisionsRecordedEarlier(input: {
  organizationId: string;
  projectId: string;
  jobId?: string;
  targetLocale: string;
  step: "translation" | "review";
  segmentIds: string[];
  revisions: string[];
}): Promise<Set<string>> {
  const ownSegments = new Set(input.segmentIds);
  const found = new Set<string>();
  for (let offset = 0; offset < input.revisions.length; offset += REPORTING_BATCH_SIZE) {
    const rows = await db
      .select({
        segmentId: schema.reportingAnalyses.segmentId,
        sourceRevision: schema.reportingAnalyses.sourceRevision,
      })
      .from(schema.reportingAnalyses)
      .where(
        and(
          eq(schema.reportingAnalyses.organizationId, input.organizationId),
          input.jobId
            ? eq(schema.reportingAnalyses.jobId, input.jobId)
            : and(
                isNull(schema.reportingAnalyses.jobId),
                eq(schema.reportingAnalyses.projectId, input.projectId),
              ),
          eq(schema.reportingAnalyses.targetLocale, input.targetLocale),
          eq(schema.reportingAnalyses.step, input.step),
          eq(schema.reportingAnalyses.isCurrent, true),
          inArray(
            schema.reportingAnalyses.sourceRevision,
            input.revisions.slice(offset, offset + REPORTING_BATCH_SIZE),
          ),
        ),
      );
    for (const row of rows) {
      if (!ownSegments.has(row.segmentId)) found.add(row.sourceRevision);
    }
  }
  return found;
}

type CompletionsInput = {
  organizationId: string;
  jobId?: string;
  targetLocale: string;
  sourceEntries: Record<string, string>;
  provenance: "human" | "automated";
  step?: "translation" | "review";
  /** The person whose work this is; recorded on human completions. */
  actorUserId?: string | null;
};

export async function captureCompletions(input: CompletionsInput, database: DatabaseClient = db) {
  try {
    await writeReportingCompletions(input, database);
  } catch (error) {
    console.warn("reporting_completions_failed", { jobId: input.jobId, error });
  }
}

/** Writes completions like `captureCompletions`, but throws on failure and skips the flag check. */
export async function recordCompletions(input: CompletionsInput) {
  await writeReportingCompletions(input, db, { strict: true });
}

async function writeReportingCompletions(
  input: CompletionsInput,
  database: DatabaseClient,
  options: StrictWriteOptions = {},
) {
  if (!options.strict && !(await isWorkspaceReportsCaptureEnabled(input.organizationId))) {
    return;
  }
  const step = input.step ?? "translation";
  const segmentIds = Object.keys(input.sourceEntries);
  if (segmentIds.length === 0) return;
  const analyses = await database
    .select()
    .from(schema.reportingAnalyses)
    .where(
      and(
        eq(schema.reportingAnalyses.organizationId, input.organizationId),
        input.jobId
          ? eq(schema.reportingAnalyses.jobId, input.jobId)
          : isNull(schema.reportingAnalyses.jobId),
        eq(schema.reportingAnalyses.targetLocale, input.targetLocale),
        eq(schema.reportingAnalyses.step, step),
        eq(schema.reportingAnalyses.isCurrent, true),
        inArray(schema.reportingAnalyses.segmentId, segmentIds),
      ),
    );
  if (input.provenance === "automated") {
    const rows = analyses
      .filter((analysis) => {
        const source = input.sourceEntries[analysis.segmentId];
        return (
          source !== undefined &&
          createHash("sha256").update(source).digest("hex") === analysis.sourceRevision
        );
      })
      .map((analysis) => ({
        organizationId: input.organizationId,
        projectId: analysis.projectId,
        jobId: input.jobId ?? null,
        operationKey: `completion:${analysis.id}:${step}`,
        kind: "completion" as const,
        step,
        targetLocale: input.targetLocale,
        analysisId: analysis.id,
      }));
    for (let offset = 0; offset < rows.length; offset += REPORTING_BATCH_SIZE) {
      await database
        .insert(schema.reportingActivity)
        .values(rows.slice(offset, offset + REPORTING_BATCH_SIZE))
        .onConflictDoNothing();
    }
    return;
  }
  for (const analysis of analyses) {
    const source = input.sourceEntries[analysis.segmentId];
    if (
      source === undefined ||
      createHash("sha256").update(source).digest("hex") !== analysis.sourceRevision
    )
      continue;
    const operationKey = `completion:${analysis.id}:${step}`;
    await database
      .insert(schema.reportingActivity)
      .values({
        organizationId: input.organizationId,
        projectId: analysis.projectId,
        jobId: input.jobId ?? null,
        operationKey,
        kind: "completion",
        step,
        targetLocale: input.targetLocale,
        analysisId: analysis.id,
        actorUserId: input.actorUserId ?? null,
      })
      .onConflictDoNothing();
    if (input.provenance !== "human") continue;
    if (input.jobId) {
      const [taskRate] = await database
        .select()
        .from(schema.reportingTaskRates)
        .where(
          and(
            eq(schema.reportingTaskRates.jobId, input.jobId),
            eq(schema.reportingTaskRates.step, step),
          ),
        );
      if (taskRate?.overrideUsd !== null && taskRate?.overrideUsd !== undefined) continue;
    }
    const [rate] = analysis.rateId
      ? await database
          .select()
          .from(schema.reportingRates)
          .where(eq(schema.reportingRates.id, analysis.rateId))
      : [];
    if (rate?.basis === "hour") continue;
    await database
      .insert(schema.reportingCosts)
      .values({
        organizationId: input.organizationId,
        projectId: analysis.projectId,
        jobId: input.jobId ?? null,
        operationKey: `human:${analysis.id}:${step}`,
        kind: "human",
        step,
        targetLocale: input.targetLocale,
        rateId: rate?.id,
        amountUsd:
          rate && analysis.words !== null && analysis.bucket !== "unavailable"
            ? wordCost(rate.rate, analysis.words, rate.percentages[analysis.bucket] ?? 100)
            : null,
        basis:
          rate && analysis.words !== null && analysis.bucket !== "unavailable"
            ? "rate"
            : "unpriced",
      })
      .onConflictDoNothing();
  }
}

export async function captureJobStatus(input: {
  jobId: string;
  status: string;
  operationKey: string;
  durationMs?: number;
}) {
  try {
    await writeJobStatus(input);
  } catch (error) {
    console.warn("reporting_job_status_failed", { jobId: input.jobId, error });
  }
}

async function writeJobStatus(input: {
  jobId: string;
  status: string;
  operationKey: string;
  durationMs?: number;
}) {
  const [ownedJob] = await db
    .select({ organizationId: schema.jobs.organizationId })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, input.jobId))
    .limit(1);
  if (!ownedJob || !(await isWorkspaceReportsCaptureEnabled(ownedJob.organizationId))) {
    return;
  }

  await reportingStart();
  if (input.status === "succeeded") await captureTaskOverrides(input.jobId);
  const [job] = await db
    .select({
      organizationId: schema.jobs.organizationId,
      projectId: schema.jobs.projectId,
      kind: schema.jobs.kind,
    })
    .from(schema.jobs)
    .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
    .where(and(eq(schema.jobs.id, input.jobId), isNull(schema.externalJobDetails.jobId)));
  if (!job) return;
  await db
    .insert(schema.reportingActivity)
    .values({
      ...job,
      jobId: input.jobId,
      kind: "status",
      step: job.kind,
      status: input.status,
      operationKey: input.operationKey,
      durationMs: input.durationMs,
    })
    .onConflictDoNothing();
}

/** Fixed task fees are recognized once, at job success, never at quote creation. */
export async function captureTaskOverrides(jobId: string, database: DatabaseClient = db) {
  await database.execute(sql`
    insert into reporting_costs (organization_id, project_id, job_id, operation_key, kind, step, amount_usd, basis, created_at)
    select r.organization_id, j.project_id, j.id, 'task-override:' || r.id, 'human', r.step, r.override_usd, 'manual', coalesce(j.completed_at, now())
    from reporting_task_rates r join jobs j on j.id=r.job_id
    where j.id=${jobId} and j.status='succeeded' and r.override_usd is not null
    on conflict (organization_id, operation_key) do nothing
  `);
}
