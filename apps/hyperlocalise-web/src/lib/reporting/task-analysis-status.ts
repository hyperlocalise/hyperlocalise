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
import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

import type { ReportStep, TaskAnalysisStatus } from "./report-units";

/**
 * A pending analysis not updated for this long is read as failed. Each language's step updates
 * the row when it finishes, and a step takes minutes at most, so a longer silence means the
 * workflow stopped without saying so.
 */
export const TASK_ANALYSIS_STALE_MS = 60 * 60_000;

/** What a task's Report tab is told about one step's analysis. */
export type TaskAnalysisState = {
  step: ReportStep;
  status: TaskAnalysisStatus;
  /** Some strings have no match band, so the quote is not exact. */
  incomplete: boolean;
  /** The task's strings in each language, once a language has been recorded. */
  strings: number | null;
  error: string | null;
  updatedAt: string;
};

type AnalysisKey = { organizationId: string; jobId: string; step: ReportStep };

/** Sets a step's state whole: pending when the analysis starts, done or failed when it ends. */
export async function setTaskAnalysisStatus(
  input: AnalysisKey & {
    status: TaskAnalysisStatus;
    incomplete?: boolean;
    strings?: number | null;
    error?: string | null;
  },
) {
  const values = {
    organizationId: input.organizationId,
    jobId: input.jobId,
    step: input.step,
    status: input.status,
    incomplete: input.incomplete ?? false,
    strings: input.strings ?? null,
    error: input.error ?? null,
    updatedAt: sql`now()`,
  };
  await db
    .insert(schema.reportingTaskAnalyses)
    .values(values)
    .onConflictDoUpdate({
      target: [
        schema.reportingTaskAnalyses.organizationId,
        schema.reportingTaskAnalyses.jobId,
        schema.reportingTaskAnalyses.step,
      ],
      set: {
        status: values.status,
        incomplete: values.incomplete,
        strings: values.strings,
        error: values.error,
        updatedAt: values.updatedAt,
      },
    });
}

/** Notes progress on a pending analysis: a language recorded, with the task's strings. */
export async function touchTaskAnalysis(input: AnalysisKey & { strings: number }) {
  await db
    .update(schema.reportingTaskAnalyses)
    .set({ strings: input.strings, updatedAt: sql`now()` })
    .where(
      and(
        eq(schema.reportingTaskAnalyses.organizationId, input.organizationId),
        eq(schema.reportingTaskAnalyses.jobId, input.jobId),
        eq(schema.reportingTaskAnalyses.step, input.step),
      ),
    );
}

/**
 * The state of each step's analysis for a task, none for a task never analysed (a string task,
 * an agent's job, or Reports off when it was created). A pending state left alone too long reads
 * as failed.
 */
export async function readTaskAnalysis(
  input: { organizationId: string; jobId: string },
  now = new Date(),
): Promise<TaskAnalysisState[]> {
  const rows = await db
    .select()
    .from(schema.reportingTaskAnalyses)
    .where(
      and(
        eq(schema.reportingTaskAnalyses.organizationId, input.organizationId),
        eq(schema.reportingTaskAnalyses.jobId, input.jobId),
      ),
    );
  return rows.map((row) => {
    const stale =
      row.status === "pending" && now.getTime() - row.updatedAt.getTime() > TASK_ANALYSIS_STALE_MS;
    return {
      step: row.step,
      status: stale ? "failed" : row.status,
      incomplete: row.incomplete,
      strings: row.strings,
      error: stale ? (row.error ?? "reporting_task_analysis_stopped") : row.error,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}
