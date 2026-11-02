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
import { and, count, desc, eq, gte, inArray, isNull } from "drizzle-orm";

import { db, schema, type DatabaseTransaction } from "@/lib/database/client";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import { normalizeForMatch } from "./page-corpus";
import type {
  EngineSetupProgressStage,
  EngineSuggestionDraft,
  EngineSuggestionStatus,
} from "./types";

export const ENGINE_SETUP_DAILY_RUN_LIMIT = 5;
/** Suggestions at or above this confidence, with no conflict, start out accepted. */
export const ENGINE_SETUP_PRESELECT_CONFIDENCE = 70;
const ENGINE_SETUP_ACTIVE_STATUSES = ["queued", "running"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EXISTING_GLOSSARY_TERMS = 5_000;

export type EngineSetupRun = typeof schema.engineSetupRuns.$inferSelect;
export type EngineSetupSuggestion = typeof schema.engineSetupSuggestions.$inferSelect;

export type CreateEngineSetupRunError =
  | { code: "engine_setup_run_in_progress"; runId: string }
  | { code: "engine_setup_daily_limit_reached" };

export async function createEngineSetupRun(input: {
  organizationId: string;
  createdByUserId: string | null;
  sourceUrl: string;
  sourceLocale: string | null;
  now?: Date;
}): Promise<Result<EngineSetupRun, CreateEngineSetupRunError>> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    // Serialize run creation per org so the active-run and quota checks hold.
    await tx
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, input.organizationId))
      .for("update");

    const [active] = await tx
      .select({ id: schema.engineSetupRuns.id })
      .from(schema.engineSetupRuns)
      .where(
        and(
          eq(schema.engineSetupRuns.organizationId, input.organizationId),
          inArray(schema.engineSetupRuns.status, [...ENGINE_SETUP_ACTIVE_STATUSES]),
        ),
      )
      .limit(1);
    if (active) {
      return err({ code: "engine_setup_run_in_progress" as const, runId: active.id });
    }

    const [recent] = await tx
      .select({ total: count() })
      .from(schema.engineSetupRuns)
      .where(
        and(
          eq(schema.engineSetupRuns.organizationId, input.organizationId),
          gte(schema.engineSetupRuns.createdAt, new Date(now.getTime() - DAY_MS)),
        ),
      );
    if (Number(recent?.total ?? 0) >= ENGINE_SETUP_DAILY_RUN_LIMIT) {
      return err({ code: "engine_setup_daily_limit_reached" as const });
    }

    const [run] = await tx
      .insert(schema.engineSetupRuns)
      .values({
        organizationId: input.organizationId,
        createdByUserId: input.createdByUserId,
        sourceUrl: input.sourceUrl,
        sourceLocale: input.sourceLocale,
      })
      .returning();
    return ok(run!);
  });
}

export async function findEngineSetupRun(runId: string, organizationId?: string) {
  const [run] = await db
    .select()
    .from(schema.engineSetupRuns)
    .where(
      organizationId
        ? and(
            eq(schema.engineSetupRuns.id, runId),
            eq(schema.engineSetupRuns.organizationId, organizationId),
          )
        : eq(schema.engineSetupRuns.id, runId),
    )
    .limit(1);
  return run ?? null;
}

export async function listEngineSetupRuns(organizationId: string, limit: number) {
  return db
    .select()
    .from(schema.engineSetupRuns)
    .where(eq(schema.engineSetupRuns.organizationId, organizationId))
    .orderBy(desc(schema.engineSetupRuns.createdAt))
    .limit(limit);
}

export async function setEngineSetupWorkflowRunId(runId: string, workflowRunId: string) {
  await db
    .update(schema.engineSetupRuns)
    .set({ workflowRunId })
    .where(eq(schema.engineSetupRuns.id, runId));
}

/** Moves a queued run to running. Returns null when another attempt already claimed it. */
export async function markEngineSetupRunRunning(runId: string) {
  const [run] = await db
    .update(schema.engineSetupRuns)
    .set({ status: "running", progressStage: "crawling", startedAt: new Date() })
    .where(and(eq(schema.engineSetupRuns.id, runId), eq(schema.engineSetupRuns.status, "queued")))
    .returning();
  return run ?? null;
}

export async function markEngineSetupRunProgress(input: {
  runId: string;
  progressStage: EngineSetupProgressStage;
  pagesRead?: number;
}) {
  await db
    .update(schema.engineSetupRuns)
    .set({
      progressStage: input.progressStage,
      ...(input.pagesRead === undefined ? {} : { pagesRead: input.pagesRead }),
    })
    .where(
      and(eq(schema.engineSetupRuns.id, input.runId), eq(schema.engineSetupRuns.status, "running")),
    );
}

export async function failEngineSetupRun(input: {
  runId: string;
  status: "failed" | "blocked";
  errorCode: string;
  errorMessage: string;
}) {
  await db
    .update(schema.engineSetupRuns)
    .set({
      status: input.status,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.engineSetupRuns.id, input.runId),
        inArray(schema.engineSetupRuns.status, [...ENGINE_SETUP_ACTIVE_STATUSES]),
      ),
    );
}

export function initialSuggestionStatus(draft: EngineSuggestionDraft): EngineSuggestionStatus {
  return draft.conflict === null && draft.confidence >= ENGINE_SETUP_PRESELECT_CONFIDENCE
    ? "accepted"
    : "pending";
}

/** Stores suggestions and marks the run ready for review in one transaction. */
export async function completeEngineSetupRun(input: {
  runId: string;
  organizationId: string;
  sourceLocale: string;
  pagesRead: number;
  drafts: EngineSuggestionDraft[];
}) {
  return db.transaction(async (tx) => {
    if (input.drafts.length > 0) {
      await tx
        .insert(schema.engineSetupSuggestions)
        .values(
          input.drafts.map((draft) => ({
            runId: input.runId,
            organizationId: input.organizationId,
            kind: draft.kind,
            dedupeKey: draft.dedupeKey,
            payload: draft.payload,
            evidence: draft.evidence,
            confidence: draft.confidence,
            conflict: draft.conflict,
            status: initialSuggestionStatus(draft),
          })),
        )
        .onConflictDoNothing();
    }

    const [run] = await tx
      .update(schema.engineSetupRuns)
      .set({
        status: "ready",
        progressStage: null,
        sourceLocale: input.sourceLocale,
        pagesRead: input.pagesRead,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(schema.engineSetupRuns.id, input.runId),
          eq(schema.engineSetupRuns.status, "running"),
        ),
      )
      .returning();
    return run ?? null;
  });
}

export async function listEngineSetupSuggestions(runId: string) {
  return db
    .select()
    .from(schema.engineSetupSuggestions)
    .where(eq(schema.engineSetupSuggestions.runId, runId))
    .orderBy(desc(schema.engineSetupSuggestions.confidence), schema.engineSetupSuggestions.id);
}

/** Sets review status on suggestions that belong to the run and are not applied yet. */
export async function updateEngineSetupSuggestionStatuses(input: {
  runId: string;
  suggestionIds: string[];
  status: EngineSuggestionStatus;
}) {
  if (input.suggestionIds.length === 0) return 0;
  const updated = await db
    .update(schema.engineSetupSuggestions)
    .set({ status: input.status })
    .where(
      and(
        eq(schema.engineSetupSuggestions.runId, input.runId),
        inArray(schema.engineSetupSuggestions.id, input.suggestionIds),
        isNull(schema.engineSetupSuggestions.appliedAt),
      ),
    )
    .returning({ id: schema.engineSetupSuggestions.id });
  return updated.length;
}

/** Records applied term suggestions and their glossary, so a retried apply reuses it. */
export async function recordEngineSetupGlossaryApplied(input: {
  runId: string;
  suggestionIds: string[];
  glossaryId: string;
}) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await markSuggestionsApplied(tx, input.runId, input.suggestionIds, now);
    await tx
      .update(schema.engineSetupRuns)
      .set({ appliedGlossaryId: input.glossaryId })
      .where(eq(schema.engineSetupRuns.id, input.runId));
  });
}

async function markSuggestionsApplied(
  tx: DatabaseTransaction,
  runId: string,
  suggestionIds: string[],
  now: Date,
) {
  if (suggestionIds.length === 0) return;
  await tx
    .update(schema.engineSetupSuggestions)
    .set({ appliedAt: now })
    .where(
      and(
        eq(schema.engineSetupSuggestions.runId, runId),
        inArray(schema.engineSetupSuggestions.id, suggestionIds),
      ),
    );
}

export async function markEngineSetupApplied(input: {
  runId: string;
  suggestionIds: string[];
  appliedByUserId: string;
  appliedKnowledgeRevisionId: string | null;
}) {
  const now = new Date();
  return db.transaction(async (tx) => {
    await markSuggestionsApplied(tx, input.runId, input.suggestionIds, now);
    const [run] = await tx
      .update(schema.engineSetupRuns)
      .set({
        status: "applied",
        appliedAt: now,
        appliedByUserId: input.appliedByUserId,
        appliedKnowledgeRevisionId: input.appliedKnowledgeRevisionId,
      })
      .where(
        and(eq(schema.engineSetupRuns.id, input.runId), eq(schema.engineSetupRuns.status, "ready")),
      )
      .returning();
    return run ?? null;
  });
}

/** Normalized source terms already in the org's native glossaries, for conflict flags. */
export async function loadExistingGlossaryTermKeys(organizationId: string): Promise<Set<string>> {
  const rows = await db
    .select({ term: schema.glossaryTerms.term })
    .from(schema.glossaryTerms)
    .innerJoin(schema.glossaries, eq(schema.glossaryTerms.glossaryId, schema.glossaries.id))
    .where(
      and(
        eq(schema.glossaries.organizationId, organizationId),
        eq(schema.glossaries.source, "native"),
        isNull(schema.glossaryTerms.archivedAt),
      ),
    )
    .limit(MAX_EXISTING_GLOSSARY_TERMS);
  return new Set(rows.map((row) => normalizeForMatch(row.term ?? "")).filter(Boolean));
}
