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
import { countSourceCharacters, countSourceWords, matchBucket } from "./word-analysis";
import { MemoryMatchIndex, MemorySourceScan, sourceSimilarity } from "./memory-match-index";
import { unitCost } from "./money";
import { markSummaryDays, refreshMarkedDays, summaryDay, type SummaryMark } from "./summary";
import { reportingStart } from "./reporting-start";

export { getReportingStart, reportingStart } from "./reporting-start";

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
/**
 * Version 3: 100 only for an exact copy of the source text (as translation reuse requires),
 * otherwise at most 99; candidates come from the in-memory bigram index on normalized text.
 */
export const MATCH_ALGORITHM_VERSION = 3;

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
  // Rates are versioned rows: a line taken off the card is a newer, retired row.
  return rate && !rate.retired ? rate : null;
}

type LoadedMemory = {
  key: string;
  sources: string[];
  scan?: MemorySourceScan;
  index?: MemoryMatchIndex;
};

/**
 * Keeps what a run has already worked out, so groups of saves that share a memory load it once:
 * the last memory loaded (one at a time, and only one that fits in a single slice, to bound memory
 * use) and every score computed, so a memory scored in slices is not reloaded for each group.
 */
export class MemoryScoreCache {
  loaded: LoadedMemory | null = null;
  readonly scores = new Map<string, number>();
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
  const allTexts = [...new Set(input.sourceTexts)];
  const scores = new Map(allTexts.map((text) => [text, 0]));
  if (!input.memoryIds.length || allTexts.length === 0) return scores;
  const sliceEntries = options.sliceEntries ?? MEMORY_SLICE_ENTRIES;
  const key = [[...input.memoryIds].sort().join(","), input.sourceLocale, input.targetLocale].join(
    "|",
  );
  const known = options.cache?.scores;
  const texts = known ? allTexts.filter((text) => !known.has(`${key}\u0000${text}`)) : allTexts;
  const remember = () => {
    for (const text of allTexts) {
      const cacheKey = `${key}\u0000${text}`;
      if (known?.has(cacheKey)) scores.set(text, known.get(cacheKey)!);
      else known?.set(cacheKey, scores.get(text)!);
    }
    return scores;
  };
  if (texts.length === 0) return remember();
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
    return remember();
  }
  let after: string | undefined;
  for (;;) {
    const rows = await db
      .select({ id: schema.memoryEntries.id, source: schema.memoryEntries.sourceText })
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
      return remember();
    }
    after = rows[rows.length - 1].id;
  }
}

/**
 * Scores a project's source texts against its memories into the run's cache in one pass, so the
 * groups of saves that follow do not each load a memory that has to be read in slices.
 */
export async function prepareMemoryScores(
  input: { projectId: string; sourceLocale: string; targetLocale: string; sourceTexts: string[] },
  cache: MemoryScoreCache,
) {
  const memoryIds = await listAttachedProjectMemoryIds(input.projectId);
  await scoreAgainstMemory({ ...input, memoryIds }, { cache });
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
  /** When each string's work was done, by segment id; recorded instead of the write time. */
  occurredAt?: Record<string, Date>;
};

/**
 * Options for a caller that has already checked the Reports flag and must know when a write fails,
 * such as the scheduled capture task: `strict` skips the flag check and throws instead of logging.
 */
type StrictWriteOptions = { strict?: boolean };

export async function captureAnalysis(input: AnalysisInput) {
  try {
    await refreshMarkedDays(input.organizationId, await writeReportingAnalysis(input));
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

/** Writes the analyses and returns the summary days they marked. */
async function writeReportingAnalysis(
  input: AnalysisInput,
  options: StrictWriteOptions & { memoryCache?: MemoryScoreCache } = {},
): Promise<SummaryMark[]> {
  if (!options.strict && !(await isWorkspaceReportsCaptureEnabled(input.organizationId))) {
    return [];
  }
  await reportingStart(input.organizationId);
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
    if (!job) return [];
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
  return db.transaction(async (tx) => {
    // One writer at a time per job (or, outside a job, project), language and step. Without it,
    // two captures of different source texts for one string can each mark the old row stale
    // before either new row exists, and both new rows stay current. Matching runs before this,
    // so the lock is held only for the reads and writes below.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${analysisScopeLockKey({ ...input, step })}, 0))`,
    );
    const recordedEarlier = await revisionsRecordedEarlier(
      {
        ...input,
        step,
        segmentIds: Object.keys(input.sourceEntries),
        revisions: uniqueTexts.map(revisionOf),
      },
      tx,
    );
    const seen = new Set<string>();
    const rows = Object.entries(input.sourceEntries).map(([segmentId, sourceText]) => {
      const normalized = sourceText.normalize("NFC").trim();
      const sourceRevision = revisionOf(sourceText);
      const repetition = seen.has(normalized) || recordedEarlier.has(sourceRevision);
      seen.add(normalized);
      const score = memoryIds ? (scores.get(sourceText) ?? null) : null;
      const characters = countSourceCharacters(sourceText, input.sourceLocale);
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
        characters: characters?.withoutSpaces ?? null,
        charactersWithSpaces: characters?.withSpaces ?? null,
        billable: input.billable ?? false,
        matchScore: score,
        bucket: matchBucket(score, repetition),
        algorithmVersion: MATCH_ALGORITHM_VERSION,
        rateId: rate?.id,
        createdAt: input.occurredAt?.[segmentId],
      };
    });
    const jobScope = input.jobId
      ? eq(schema.reportingAnalyses.jobId, input.jobId)
      : isNull(schema.reportingAnalyses.jobId);
    const versions = (pairs: { segmentId: string; sourceRevision: string }[]) =>
      sql.join(
        pairs.map((pair) => sql`(${pair.segmentId}, ${pair.sourceRevision})`),
        sql`, `,
      );
    const marks: SummaryMark[] = [];
    // Versions whose earliest current analysis, the one their source counts sit on, may have
    // moved: an old version that stopped being current here, a version current again, or one
    // recorded at a past time (an editor save), which can now be the earliest.
    const moved: { segmentId: string; sourceRevision: string }[] = [];
    for (let offset = 0; offset < rows.length; offset += REPORTING_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + REPORTING_BATCH_SIZE);
      // Only a current analysis of a different text stops being current: a re-save of the same
      // text keeps its row as it is.
      const superseded = await tx
        .update(schema.reportingAnalyses)
        .set({ isCurrent: false })
        .where(
          and(
            jobScope,
            eq(schema.reportingAnalyses.organizationId, input.organizationId),
            inArray(
              schema.reportingAnalyses.segmentId,
              batch.map((row) => row.segmentId),
            ),
            eq(schema.reportingAnalyses.targetLocale, input.targetLocale),
            eq(schema.reportingAnalyses.step, step),
            eq(schema.reportingAnalyses.isCurrent, true),
            sql`(${schema.reportingAnalyses.segmentId}, ${schema.reportingAnalyses.sourceRevision}) not in (${versions(batch)})`,
          ),
        )
        .returning({
          projectId: schema.reportingAnalyses.projectId,
          createdAt: schema.reportingAnalyses.createdAt,
          segmentId: schema.reportingAnalyses.segmentId,
          sourceRevision: schema.reportingAnalyses.sourceRevision,
        });
      const written = await tx
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
        })
        .returning({
          id: schema.reportingAnalyses.id,
          projectId: schema.reportingAnalyses.projectId,
          createdAt: schema.reportingAnalyses.createdAt,
          segmentId: schema.reportingAnalyses.segmentId,
          sourceRevision: schema.reportingAnalyses.sourceRevision,
          // An existing row keeps its original day; the write still changes that day.
          existed: sql<boolean>`xmax <> 0`,
        });
      if (input.billable) {
        // Turning an existing analysis billable moves its finished words to "payable" on the
        // day it was finished, which may be another day than it arrived.
        const existing = written.filter((row) => row.existed);
        if (existing.length > 0) {
          const finished = await tx
            .select({
              projectId: schema.reportingActivity.projectId,
              createdAt: schema.reportingActivity.createdAt,
            })
            .from(schema.reportingActivity)
            .where(
              and(
                eq(schema.reportingActivity.organizationId, input.organizationId),
                inArray(
                  schema.reportingActivity.operationKey,
                  existing.map((row) => `completion:${row.id}:${step}`),
                ),
              ),
            );
          for (const row of finished) {
            marks.push({ projectId: row.projectId, day: summaryDay(row.createdAt) });
          }
        }
      }
      for (const row of [...superseded, ...written]) {
        marks.push({ projectId: row.projectId, day: summaryDay(row.createdAt) });
      }
      moved.push(...superseded);
      moved.push(...written.filter((row) => row.existed || input.occurredAt));
    }
    for (let offset = 0; offset < moved.length; offset += REPORTING_BATCH_SIZE) {
      const others = await tx
        .select({
          projectId: schema.reportingAnalyses.projectId,
          createdAt: schema.reportingAnalyses.createdAt,
        })
        .from(schema.reportingAnalyses)
        .where(
          and(
            eq(schema.reportingAnalyses.organizationId, input.organizationId),
            jobScope,
            eq(schema.reportingAnalyses.step, step),
            eq(schema.reportingAnalyses.isCurrent, true),
            sql`(${schema.reportingAnalyses.segmentId}, ${schema.reportingAnalyses.sourceRevision}) in (${versions(moved.slice(offset, offset + REPORTING_BATCH_SIZE))})`,
          ),
        );
      for (const row of others)
        marks.push({ projectId: row.projectId, day: summaryDay(row.createdAt) });
    }
    await markSummaryDays(tx, input.organizationId, marks);
    return marks;
  });
}

/** Names the scope that `writeReportingAnalysis` serializes its writes on. */
export function analysisScopeLockKey(input: {
  organizationId: string;
  projectId: string;
  jobId?: string;
  targetLocale: string;
  step: "translation" | "review";
}): string {
  const scope = input.jobId ? `job:${input.jobId}` : `project:${input.projectId}`;
  return ["reporting-analysis", input.organizationId, scope, input.targetLocale, input.step].join(
    ":",
  );
}

/**
 * Source revisions that already have a current analysis under another segment of the same job (or,
 * outside a job, the same project), language and step. A copy recorded earlier makes this one a
 * repetition, even when the two were saved and recorded in different runs.
 */
async function revisionsRecordedEarlier(
  input: {
    organizationId: string;
    projectId: string;
    jobId?: string;
    targetLocale: string;
    step: "translation" | "review";
    segmentIds: string[];
    revisions: string[];
  },
  database: DatabaseClient,
): Promise<Set<string>> {
  const ownSegments = new Set(input.segmentIds);
  const found = new Set<string>();
  for (let offset = 0; offset < input.revisions.length; offset += REPORTING_BATCH_SIZE) {
    const rows = await database
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
  /** When each string was finished, by segment id; recorded instead of the write time. */
  occurredAt?: Record<string, Date>;
};

export async function captureCompletions(input: CompletionsInput, database: DatabaseClient = db) {
  try {
    await refreshMarkedDays(input.organizationId, await writeReportingCompletions(input, database));
  } catch (error) {
    console.warn("reporting_completions_failed", { jobId: input.jobId, error });
  }
}

/** Writes completions like `captureCompletions`, but throws on failure and skips the flag check. */
export async function recordCompletions(input: CompletionsInput) {
  await writeReportingCompletions(input, db, { strict: true });
}

/** Writes the completions (and people's costs) and returns the summary days they marked. */
async function writeReportingCompletions(
  input: CompletionsInput,
  database: DatabaseClient,
  options: StrictWriteOptions = {},
): Promise<SummaryMark[]> {
  if (!options.strict && !(await isWorkspaceReportsCaptureEnabled(input.organizationId))) {
    return [];
  }
  const step = input.step ?? "translation";
  const segmentIds = Object.keys(input.sourceEntries);
  if (segmentIds.length === 0) return [];
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
  const finishedAnalyses = analyses.filter((analysis) => {
    const source = input.sourceEntries[analysis.segmentId];
    return (
      source !== undefined &&
      createHash("sha256").update(source).digest("hex") === analysis.sourceRevision
    );
  });
  const analysisById = new Map(finishedAnalyses.map((analysis) => [analysis.id, analysis]));
  const returnedCompletion = {
    analysisId: schema.reportingActivity.analysisId,
    projectId: schema.reportingActivity.projectId,
    createdAt: schema.reportingActivity.createdAt,
  };
  return database.transaction(async (tx) => {
    const marks: SummaryMark[] = [];
    const markCompletion = (completion: {
      analysisId: string | null;
      projectId: string | null;
      createdAt: Date;
    }) => {
      marks.push({ projectId: completion.projectId, day: summaryDay(completion.createdAt) });
      // Finishing a string also changes what is done of the day it arrived on.
      const analysis = completion.analysisId ? analysisById.get(completion.analysisId) : undefined;
      if (analysis)
        marks.push({ projectId: analysis.projectId, day: summaryDay(analysis.createdAt) });
    };
    if (input.provenance === "automated") {
      const rows = finishedAnalyses.map((analysis) => ({
        organizationId: input.organizationId,
        projectId: analysis.projectId,
        jobId: input.jobId ?? null,
        operationKey: `completion:${analysis.id}:${step}`,
        kind: "completion" as const,
        step,
        targetLocale: input.targetLocale,
        analysisId: analysis.id,
        createdAt: input.occurredAt?.[analysis.segmentId],
      }));
      for (let offset = 0; offset < rows.length; offset += REPORTING_BATCH_SIZE) {
        const inserted = await tx
          .insert(schema.reportingActivity)
          .values(rows.slice(offset, offset + REPORTING_BATCH_SIZE))
          .onConflictDoNothing()
          .returning(returnedCompletion);
        inserted.forEach(markCompletion);
      }
      await markSummaryDays(tx, input.organizationId, marks);
      return marks;
    }
    for (const analysis of finishedAnalyses) {
      const operationKey = `completion:${analysis.id}:${step}`;
      const written = await tx
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
          createdAt: input.occurredAt?.[analysis.segmentId],
        })
        // One completion per analysis and step: when a person finishes a string a job already
        // completed (a post-edit), the person is added to that completion rather than dropped.
        .onConflictDoUpdate({
          target: [schema.reportingActivity.organizationId, schema.reportingActivity.operationKey],
          set: { actorUserId: sql`excluded.actor_user_id` },
          where: sql`${schema.reportingActivity.actorUserId} is null and excluded.actor_user_id is not null`,
        })
        .returning(returnedCompletion);
      written.forEach(markCompletion);
      if (input.provenance !== "human") continue;
      if (input.jobId) {
        const [taskRate] = await tx
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
        ? await tx
            .select()
            .from(schema.reportingRates)
            .where(eq(schema.reportingRates.id, analysis.rateId))
        : [];
      if (rate?.basis === "hour") continue;
      // Priced in the rate's own unit, whatever unit a report later shows.
      const units =
        rate?.basis === "character"
          ? analysis.characters
          : rate?.basis === "character_with_spaces"
            ? analysis.charactersWithSpaces
            : analysis.words;
      const priced = rate && units !== null && analysis.bucket !== "unavailable";
      await tx
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
          amountUsd: priced
            ? unitCost(rate.rate, units, rate.percentages[analysis.bucket] ?? 100)
            : null,
          basis: priced ? "rate" : "unpriced",
          createdAt: input.occurredAt?.[analysis.segmentId],
        })
        .onConflictDoNothing();
    }
    await markSummaryDays(tx, input.organizationId, marks);
    return marks;
  });
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

  await reportingStart(ownedJob.organizationId);
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
