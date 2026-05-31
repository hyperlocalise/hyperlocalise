import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { HlCheckReport } from "@/lib/providers/provider-job-qa/hl-check-types";

export type GithubRepositoryAutomationCommitResultStatus =
  | "skipped"
  | "passed"
  | "warning"
  | "failed"
  | "error";

export type GithubRepositoryAutomationCommitResultRecord = {
  id: string;
  jobId: string;
  commitSha: string;
  parentCommitSha: string | null;
  status: GithubRepositoryAutomationCommitResultStatus;
  skipReason: string | null;
  changedPaths: string[];
  hlCheckReport: HlCheckReport | null;
  agentSummary: string | null;
  suggestedFixes: Record<string, unknown>[] | null;
  logUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type CommitResultRow = typeof schema.githubRepositoryAutomationCommitResults.$inferSelect;

function serializeRow(row: CommitResultRow): GithubRepositoryAutomationCommitResultRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    commitSha: row.commitSha,
    parentCommitSha: row.parentCommitSha,
    status: row.status as GithubRepositoryAutomationCommitResultStatus,
    skipReason: row.skipReason,
    changedPaths: row.changedPaths ?? [],
    hlCheckReport: (row.hlCheckReport as HlCheckReport | null) ?? null,
    agentSummary: row.agentSummary,
    suggestedFixes: (row.suggestedFixes as Record<string, unknown>[] | null) ?? null,
    logUrl: row.logUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function upsertGithubRepositoryAutomationCommitResult(input: {
  jobId: string;
  commitSha: string;
  parentCommitSha?: string | null;
  status: GithubRepositoryAutomationCommitResultStatus;
  skipReason?: string | null;
  changedPaths?: string[];
  hlCheckReport?: HlCheckReport | null;
  agentSummary?: string | null;
  suggestedFixes?: Record<string, unknown>[] | null;
  logUrl?: string | null;
}): Promise<GithubRepositoryAutomationCommitResultRecord> {
  const [row] = await db
    .insert(schema.githubRepositoryAutomationCommitResults)
    .values({
      jobId: input.jobId,
      commitSha: input.commitSha,
      parentCommitSha: input.parentCommitSha ?? null,
      status: input.status,
      skipReason: input.skipReason ?? null,
      changedPaths: input.changedPaths ?? [],
      hlCheckReport: input.hlCheckReport ?? null,
      agentSummary: input.agentSummary ?? null,
      suggestedFixes: input.suggestedFixes ?? null,
      logUrl: input.logUrl ?? null,
    })
    .onConflictDoUpdate({
      target: [
        schema.githubRepositoryAutomationCommitResults.jobId,
        schema.githubRepositoryAutomationCommitResults.commitSha,
      ],
      set: {
        parentCommitSha: input.parentCommitSha ?? null,
        status: input.status,
        skipReason: input.skipReason ?? null,
        changedPaths: input.changedPaths ?? [],
        hlCheckReport: input.hlCheckReport ?? null,
        agentSummary: input.agentSummary ?? null,
        suggestedFixes: input.suggestedFixes ?? null,
        logUrl: input.logUrl ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) {
    throw new Error("failed to persist github repository automation commit result");
  }

  return serializeRow(row);
}

export async function listGithubRepositoryAutomationCommitResults(input: {
  jobId: string;
}): Promise<GithubRepositoryAutomationCommitResultRecord[]> {
  const rows = await db
    .select()
    .from(schema.githubRepositoryAutomationCommitResults)
    .where(eq(schema.githubRepositoryAutomationCommitResults.jobId, input.jobId))
    .orderBy(schema.githubRepositoryAutomationCommitResults.createdAt);

  return rows.map(serializeRow);
}

export function summarizeCommitResults(
  results: GithubRepositoryAutomationCommitResultRecord[],
): Record<string, unknown> {
  const counts = {
    skipped: 0,
    passed: 0,
    warning: 0,
    failed: 0,
    error: 0,
  };

  for (const result of results) {
    counts[result.status] += 1;
  }

  const hasBlockingFailures = results.some((result) => result.status === "failed");
  const hasInfrastructureErrors = results.some((result) => result.status === "error");

  return {
    totalCommits: results.length,
    counts,
    hasBlockingFailures,
    hasInfrastructureErrors,
    hasWarnings: results.some((result) => result.status === "warning"),
  };
}
