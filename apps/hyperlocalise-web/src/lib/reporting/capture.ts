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
import { and, asc, eq, desc, gt, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { listAttachedProjectMemoryIds } from "@/lib/memory/ensure-default-native-project-memory";
import { countSourceCharacters, countSourceWords, matchBucket } from "./word-analysis";
import { OPEN_TASK_STATUSES, type CompletionSource } from "./report-units";
import { MemoryMatchIndex, MemorySourceScan, sourceSimilarity } from "./memory-match-index";
import { paidPercent, unitCost } from "./money";
import { memoryUnavailable } from "./memory-unavailable";
import { markSummaryDays, summaryDay, type SummaryMark } from "./summary";
import { reportingStart } from "./reporting-start";

export { getReportingStart, reportingStart } from "./reporting-start";

export { sourceSimilarity };

const REPORTING_BATCH_SIZE = 500;
/**
 * Memory entries loaded and indexed at a time. A larger memory is scored one slice after another,
 * keeping each string's best score. The index takes about 0.5 MB per 1,000 sentence-length
 * entries (English or Japanese), about 2.5 MB for paragraphs, and 5 to 10 MB for long document
 * sections or text with very many distinct character pairs. Several jobs can share one function
 * instance, so this keeps a few concurrent jobs inside a 2 GB function for most memories.
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

/**
 * Whether Reports records work for the workspace. A failed lookup is tried once more, then read
 * as off and logged as an error: the write that asked is then dropped, which must be visible,
 * while recording anyway would record work for workspaces with Reports off.
 */
export async function isWorkspaceReportsCaptureEnabled(organizationId: string): Promise<boolean> {
  const { resolveWorkspaceReportsFlag } = await import("@/lib/flags/workspace-flags");
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await resolveWorkspaceReportsFlag({ organizationId });
    } catch (error) {
      if (attempt === 0) continue;
      console.error("reporting_flag_lookup_failed", { organizationId, error });
      return false;
    }
  }
}

/**
 * The rate line that prices work: from the task's own rate card, as the card was when the task
 * was priced; else from its project budget's card, as it is now. The first card found prices
 * every language, so a language it has no line for has no rate. Null when none applies.
 */
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
  const [taskRate] = input.jobId
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
  // Compared in the database: a JavaScript date drops the microseconds of the moment priced.
  if (taskRate?.rateCardName)
    return rateLine(
      database,
      input,
      taskRate.rateCardName,
      sql`(select priced_at from reporting_task_rates where id = ${taskRate.id})`,
    );
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
  return rateLine(database, input, budget.rateCardName, null);
}

/** A card's line for a language pair and step, as of the time `asOf` reads (now when null). */
async function rateLine(
  database: DatabaseClient,
  input: {
    organizationId: string;
    sourceLocale: string;
    targetLocale: string;
    step: "translation" | "review";
  },
  name: string,
  asOf: SQL | null,
) {
  const [rate] = await database
    .select()
    .from(schema.reportingRates)
    .where(
      and(
        eq(schema.reportingRates.organizationId, input.organizationId),
        eq(schema.reportingRates.name, name),
        eq(schema.reportingRates.sourceLocale, input.sourceLocale),
        eq(schema.reportingRates.targetLocale, input.targetLocale),
        eq(schema.reportingRates.step, input.step),
        asOf ? lte(schema.reportingRates.createdAt, asOf) : undefined,
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
    await writeReportingAnalysis(input);
  } catch (error) {
    console.warn("reporting_analysis_failed", { jobId: input.jobId, error });
  }
}

export { isMemoryUnavailableError, MEMORY_UNAVAILABLE } from "./memory-unavailable";

type MemoryOptions = {
  memoryCache?: MemoryScoreCache;
  /**
   * Record the strings without reading the memory, so they have no match band: for a caller that
   * could not read the memory and wants the strings recorded all the same.
   */
  withoutMemory?: boolean;
};

/**
 * Writes an analysis like `captureAnalysis`, but throws on failure and skips the flag check.
 * Returns the summary days it marked.
 */
export async function recordAnalysis(
  input: AnalysisInput,
  options: MemoryOptions = {},
): Promise<SummaryMark[]> {
  return writeReportingAnalysis(input, { ...options, strict: true });
}

/** Writes the analyses and returns the summary days they marked. */
async function writeReportingAnalysis(
  input: AnalysisInput,
  options: StrictWriteOptions & MemoryOptions = {},
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
  if (!options.withoutMemory) {
    try {
      memoryIds = await listAttachedProjectMemoryIds(input.projectId);
    } catch (error) {
      if (options.strict) throw memoryUnavailable(error);
      console.warn("reporting_match_analysis_unavailable", { jobId: input.jobId });
    }
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
      if (options.strict) throw memoryUnavailable(error);
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
    // A copy is a repetition by the same key within this call as across runs: the hash of the
    // raw text, which is also the row's identity. A string that differs only in spacing is not one.
    const seen = new Set<string>();
    const rows = Object.entries(input.sourceEntries).map(([segmentId, sourceText]) => {
      const sourceRevision = revisionOf(sourceText);
      const repetition = seen.has(sourceRevision) || recordedEarlier.has(sourceRevision);
      seen.add(sourceRevision);
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
    // Versions whose other current analyses' days must be worked out again: the earliest one
    // carries the text's source counts and, for the project, the string's arrival, and whether
    // any of them is open or done decides if the string is abandoned. So every version written
    // moves them (a new task taking on a string a cancelled task left unfinished makes it open
    // again), as does an old version that stopped being current here.
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
      moved.push(...written);
    }
    // In any task of the project: the project's rows count a string once, on its earliest
    // current analysis across tasks, so a change here can move another task's day too.
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
            eq(schema.reportingAnalyses.projectId, input.projectId),
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
  /** Where each finished string's text came from, by segment id; `source` for the rest. */
  sources?: Record<string, CompletionSource>;
  source?: CompletionSource;
  /** Whether a person finished the string without changing its text, by segment id. */
  unchanged?: Record<string, boolean>;
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
    // A person's work is priced when it is finished, at the rate in force then, as the estimate
    // prices it: the task's own card as it was when the task was priced, else its project
    // budget's card now. A task for people has its strings recorded before it is priced, so the
    // rate stored with each string when it arrived is not the one that applies.
    const rates = new Map<string, Awaited<ReturnType<typeof resolveReportingRate>>>();
    const rateFor = async (analysis: { projectId: string | null; sourceLocale: string }) => {
      if (!analysis.projectId) return null;
      const key = `${analysis.projectId}\u0000${analysis.sourceLocale}`;
      let rate = rates.get(key);
      if (rate === undefined) {
        rate = await resolveReportingRate(
          {
            organizationId: input.organizationId,
            projectId: analysis.projectId,
            jobId: input.jobId,
            sourceLocale: analysis.sourceLocale,
            targetLocale: input.targetLocale,
            step,
          },
          tx,
        );
        rates.set(key, rate);
      }
      return rate;
    };
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
    // The project's rows count a string once, on its earliest current analysis across tasks, so
    // finishing it here changes the day that analysis arrived on, whichever task holds it.
    const markSiblingDays = async () => {
      for (let offset = 0; offset < finishedAnalyses.length; offset += REPORTING_BATCH_SIZE) {
        const batch = finishedAnalyses.slice(offset, offset + REPORTING_BATCH_SIZE);
        const siblings = await tx
          .select({
            projectId: schema.reportingAnalyses.projectId,
            createdAt: schema.reportingAnalyses.createdAt,
          })
          .from(schema.reportingAnalyses)
          .where(
            and(
              eq(schema.reportingAnalyses.organizationId, input.organizationId),
              eq(schema.reportingAnalyses.targetLocale, input.targetLocale),
              eq(schema.reportingAnalyses.step, step),
              eq(schema.reportingAnalyses.isCurrent, true),
              sql`(${schema.reportingAnalyses.segmentId}, ${schema.reportingAnalyses.sourceRevision}) in (${sql.join(
                batch.map((analysis) => sql`(${analysis.segmentId}, ${analysis.sourceRevision})`),
                sql`, `,
              )})`,
            ),
          );
        for (const row of siblings)
          marks.push({ projectId: row.projectId, day: summaryDay(row.createdAt) });
      }
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
        source: input.sources?.[analysis.segmentId] ?? input.source ?? null,
        unchanged: input.unchanged?.[analysis.segmentId] ?? null,
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
      if (marks.length > 0) await markSiblingDays();
      await markSummaryDays(tx, input.organizationId, marks);
      return marks;
    }
    // A person's save moves a completion a job made to the person's day (below), so the day it
    // leaves must be worked out again too.
    const earlier = new Map<string, { projectId: string | null; createdAt: Date }>();
    for (let offset = 0; offset < finishedAnalyses.length; offset += REPORTING_BATCH_SIZE) {
      const rows = await tx
        .select({
          operationKey: schema.reportingActivity.operationKey,
          projectId: schema.reportingActivity.projectId,
          createdAt: schema.reportingActivity.createdAt,
        })
        .from(schema.reportingActivity)
        .where(
          and(
            eq(schema.reportingActivity.organizationId, input.organizationId),
            inArray(
              schema.reportingActivity.operationKey,
              finishedAnalyses
                .slice(offset, offset + REPORTING_BATCH_SIZE)
                .map((analysis) => `completion:${analysis.id}:${step}`),
            ),
          ),
        );
      for (const row of rows) earlier.set(row.operationKey, row);
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
          source: input.sources?.[analysis.segmentId] ?? input.source ?? null,
          unchanged: input.unchanged?.[analysis.segmentId] ?? null,
          createdAt: input.occurredAt?.[analysis.segmentId],
        })
        // One completion per analysis and step: when a person finishes a string a job already
        // completed (a post-edit), the person is added to that completion rather than dropped,
        // and it is dated by the person's save: the work is theirs, done then, not on the job's
        // day. The source becomes what the person's save says: the job's when they kept its
        // text, their own when they rewrote it; the job's stays only when the save does not know.
        .onConflictDoUpdate({
          target: [schema.reportingActivity.organizationId, schema.reportingActivity.operationKey],
          set: {
            actorUserId: sql`excluded.actor_user_id`,
            source: sql`coalesce(excluded.source, ${schema.reportingActivity.source})`,
            unchanged: sql`excluded.unchanged`,
            createdAt: sql`excluded.created_at`,
          },
          where: sql`${schema.reportingActivity.actorUserId} is null and excluded.actor_user_id is not null`,
        })
        .returning(returnedCompletion);
      written.forEach(markCompletion);
      const before = earlier.get(operationKey);
      if (written.length > 0 && before)
        marks.push({ projectId: before.projectId, day: summaryDay(before.createdAt) });
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
      const rate = await rateFor(analysis);
      // An hourly line prices the time logged on the task, not its strings.
      if (rate?.basis === "hour") continue;
      // Priced in the rate's own unit, whatever unit a report later shows.
      const units =
        rate?.basis === "character"
          ? analysis.characters
          : rate?.basis === "character_with_spaces"
            ? analysis.charactersWithSpaces
            : analysis.words;
      const priced = rate && units !== null;
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
            ? unitCost(rate.rate, units, paidPercent(rate.percentages, analysis.bucket))
            : null,
          basis: priced ? "rate" : "unpriced",
          createdAt: input.occurredAt?.[analysis.segmentId],
        })
        .onConflictDoNothing();
    }
    if (marks.length > 0) await markSiblingDays();
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
  // A task that is no longer open holds its unfinished strings no more: the days they arrived
  // on are worked out again, so Progress leaves them out. Status changes are not Reports writes,
  // so nothing else would mark those days.
  if (!OPEN_TASK_STATUSES.has(input.status))
    await markTaskDays(ownedJob.organizationId, input.jobId);
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

/**
 * Marks the days of a task's current strings, and of the same strings in other tasks, for their
 * project's summary to be worked out again: the project counts a string on its earliest current
 * analysis, which may be another task's, and whether it is abandoned depends on every task that
 * holds it.
 */
async function markTaskDays(organizationId: string, jobId: string) {
  await db.transaction(async (tx) => {
    // The task's strings by the identity index's first two columns, their siblings by the segment
    // index.
    const rows = await tx.execute<{ projectId: string; day: string }>(sql`
      select distinct s.project_id as "projectId",
        (s.created_at at time zone 'UTC')::date::text as day
      from reporting_analyses a
      join reporting_analyses s on s.organization_id = a.organization_id
        and s.segment_id = a.segment_id and s.target_locale = a.target_locale
        and s.step = a.step and s.source_revision = a.source_revision and s.is_current
      where a.organization_id = ${organizationId} and a.job_id = ${jobId} and a.is_current
        and s.project_id is not null
    `);
    await markSummaryDays(tx, organizationId, rows.rows);
  });
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
