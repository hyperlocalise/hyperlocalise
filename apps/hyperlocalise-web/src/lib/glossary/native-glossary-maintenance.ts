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

export type GlossaryReviewDecision = "proposed" | "approved" | "rejected" | "superseded";

type MaintenanceResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code:
        | "not_found"
        | "version_conflict"
        | "invalid_transition"
        | "reason_required"
        | "primary_term";
      currentVersion?: number;
      currentStatus?: string;
    };

function canTransition(current: string, next: GlossaryReviewDecision) {
  if (current === "proposed") return ["approved", "rejected", "superseded"].includes(next);
  if (current === "rejected") return next === "proposed";
  if (current === "approved") return next === "superseded";
  return false;
}

function requireReason(decision: GlossaryReviewDecision) {
  return decision === "rejected" || decision === "superseded";
}

export async function reviewGlossaryConcept(input: {
  glossaryId: string;
  conceptId: string;
  actorUserId: string;
  decision: GlossaryReviewDecision;
  reason?: string | null;
  expectedVersion?: number;
}): Promise<MaintenanceResult<typeof schema.glossaryConcepts.$inferSelect>> {
  return db.transaction(async (tx) => {
    const current = await tx.query.glossaryConcepts.findFirst({
      where: and(
        eq(schema.glossaryConcepts.id, input.conceptId),
        eq(schema.glossaryConcepts.glossaryId, input.glossaryId),
      ),
    });
    if (!current) return { ok: false, code: "not_found" };
    if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
      return { ok: false, code: "version_conflict", currentVersion: current.version };
    }
    if (!canTransition(current.reviewStatus, input.decision)) {
      return { ok: false, code: "invalid_transition", currentStatus: current.reviewStatus };
    }
    if (requireReason(input.decision) && !input.reason?.trim()) {
      return { ok: false, code: "reason_required" };
    }
    const [updated] = await tx
      .update(schema.glossaryConcepts)
      .set({
        reviewStatus: input.decision,
        reviewedByUserId: input.actorUserId,
        reviewedAt: new Date(),
        reviewReason: input.reason?.trim() || null,
        modifiedByUserId: input.actorUserId,
        version: current.version + 1,
      })
      .where(
        and(
          eq(schema.glossaryConcepts.id, input.conceptId),
          eq(schema.glossaryConcepts.glossaryId, input.glossaryId),
          eq(schema.glossaryConcepts.version, current.version),
        ),
      )
      .returning();
    if (!updated) return { ok: false, code: "version_conflict", currentVersion: current.version };
    await tx.insert(schema.glossaryHistoryEvents).values({
      organizationId: await organizationIdForGlossary(tx, input.glossaryId),
      glossaryId: input.glossaryId,
      conceptId: input.conceptId,
      eventType: `concept_${input.decision}`,
      actorKind: "user",
      actorUserId: input.actorUserId,
      version: updated.version,
      reason: input.reason?.trim() || null,
      changedFields: ["reviewStatus", "reviewedByUserId", "reviewedAt", "reviewReason"],
      changes: [{ field: "reviewStatus", before: current.reviewStatus, after: input.decision }],
    });
    return { ok: true, value: updated };
  });
}

export async function reviewGlossaryTerm(input: {
  glossaryId: string;
  conceptId: string;
  termId: string;
  actorUserId: string;
  decision: GlossaryReviewDecision;
  reason?: string | null;
  expectedVersion?: number;
}): Promise<MaintenanceResult<typeof schema.glossaryTerms.$inferSelect>> {
  return db.transaction(async (tx) => {
    const current = await tx.query.glossaryTerms.findFirst({
      where: and(
        eq(schema.glossaryTerms.id, input.termId),
        eq(schema.glossaryTerms.conceptId, input.conceptId),
        eq(schema.glossaryTerms.glossaryId, input.glossaryId),
      ),
    });
    if (!current) return { ok: false, code: "not_found" };
    if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
      return { ok: false, code: "version_conflict", currentVersion: current.version };
    }
    if (!canTransition(current.reviewStatus, input.decision)) {
      return { ok: false, code: "invalid_transition", currentStatus: current.reviewStatus };
    }
    if (requireReason(input.decision) && !input.reason?.trim()) {
      return { ok: false, code: "reason_required" };
    }
    const [updated] = await tx
      .update(schema.glossaryTerms)
      .set({
        reviewStatus: input.decision,
        reviewedByUserId: input.actorUserId,
        reviewedAt: new Date(),
        reviewReason: input.reason?.trim() || null,
        modifiedByUserId: input.actorUserId,
        version: current.version + 1,
      })
      .where(
        and(
          eq(schema.glossaryTerms.id, input.termId),
          eq(schema.glossaryTerms.conceptId, input.conceptId),
          eq(schema.glossaryTerms.glossaryId, input.glossaryId),
          eq(schema.glossaryTerms.version, current.version),
        ),
      )
      .returning();
    if (!updated) return { ok: false, code: "version_conflict", currentVersion: current.version };
    await tx.insert(schema.glossaryHistoryEvents).values({
      organizationId: await organizationIdForGlossary(tx, input.glossaryId),
      glossaryId: input.glossaryId,
      conceptId: input.conceptId,
      termId: input.termId,
      eventType: `term_${input.decision}`,
      actorKind: "user",
      actorUserId: input.actorUserId,
      version: updated.version,
      reason: input.reason?.trim() || null,
      changedFields: ["reviewStatus", "reviewedByUserId", "reviewedAt", "reviewReason"],
      changes: [{ field: "reviewStatus", before: current.reviewStatus, after: input.decision }],
    });
    return { ok: true, value: updated };
  });
}

export async function setGlossaryConceptArchived(input: {
  glossaryId: string;
  conceptId: string;
  actorUserId: string;
  archived: boolean;
  expectedVersion?: number;
}): Promise<MaintenanceResult<typeof schema.glossaryConcepts.$inferSelect>> {
  return db.transaction(async (tx) => {
    const current = await tx.query.glossaryConcepts.findFirst({
      where: and(
        eq(schema.glossaryConcepts.id, input.conceptId),
        eq(schema.glossaryConcepts.glossaryId, input.glossaryId),
      ),
    });
    if (!current) return { ok: false, code: "not_found" };
    if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
      return { ok: false, code: "version_conflict", currentVersion: current.version };
    }
    const archivedAt = input.archived ? new Date() : null;
    const [updated] = await tx
      .update(schema.glossaryConcepts)
      .set({
        archivedAt,
        archivedByUserId: input.archived ? input.actorUserId : null,
        modifiedByUserId: input.actorUserId,
        version: current.version + 1,
      })
      .where(
        and(
          eq(schema.glossaryConcepts.id, input.conceptId),
          eq(schema.glossaryConcepts.glossaryId, input.glossaryId),
          eq(schema.glossaryConcepts.version, current.version),
        ),
      )
      .returning();
    if (!updated) return { ok: false, code: "version_conflict", currentVersion: current.version };
    await tx.insert(schema.glossaryHistoryEvents).values({
      organizationId: await organizationIdForGlossary(tx, input.glossaryId),
      glossaryId: input.glossaryId,
      conceptId: input.conceptId,
      eventType: input.archived ? "concept_archived" : "concept_restored",
      actorKind: "user",
      actorUserId: input.actorUserId,
      version: updated.version,
      changedFields: ["archivedAt", "archivedByUserId"],
      changes: [
        {
          field: "archivedAt",
          before: current.archivedAt?.toISOString() ?? null,
          after: archivedAt?.toISOString() ?? null,
        },
      ],
    });
    return { ok: true, value: updated };
  });
}

export async function setGlossaryTermArchived(input: {
  glossaryId: string;
  conceptId: string;
  termId: string;
  actorUserId: string;
  archived: boolean;
  expectedVersion?: number;
}): Promise<MaintenanceResult<typeof schema.glossaryTerms.$inferSelect>> {
  return db.transaction(async (tx) => {
    const current = await tx.query.glossaryTerms.findFirst({
      where: and(
        eq(schema.glossaryTerms.id, input.termId),
        eq(schema.glossaryTerms.conceptId, input.conceptId),
        eq(schema.glossaryTerms.glossaryId, input.glossaryId),
      ),
    });
    if (!current) return { ok: false, code: "not_found" };
    const glossary = await tx.query.glossaries.findFirst({
      where: eq(schema.glossaries.id, input.glossaryId),
      columns: { sourceLocale: true },
    });
    if (input.archived && glossary?.sourceLocale === current.locale) {
      return { ok: false, code: "primary_term" };
    }
    if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
      return { ok: false, code: "version_conflict", currentVersion: current.version };
    }
    const archivedAt = input.archived ? new Date() : null;
    const [updated] = await tx
      .update(schema.glossaryTerms)
      .set({
        archivedAt,
        archivedByUserId: input.archived ? input.actorUserId : null,
        modifiedByUserId: input.actorUserId,
        version: current.version + 1,
      })
      .where(
        and(
          eq(schema.glossaryTerms.id, input.termId),
          eq(schema.glossaryTerms.conceptId, input.conceptId),
          eq(schema.glossaryTerms.glossaryId, input.glossaryId),
          eq(schema.glossaryTerms.version, current.version),
        ),
      )
      .returning();
    if (!updated) return { ok: false, code: "version_conflict", currentVersion: current.version };
    await tx.insert(schema.glossaryHistoryEvents).values({
      organizationId: await organizationIdForGlossary(tx, input.glossaryId),
      glossaryId: input.glossaryId,
      conceptId: input.conceptId,
      termId: input.termId,
      eventType: input.archived ? "term_archived" : "term_restored",
      actorKind: "user",
      actorUserId: input.actorUserId,
      version: updated.version,
      changedFields: ["archivedAt", "archivedByUserId"],
      changes: [
        {
          field: "archivedAt",
          before: current.archivedAt?.toISOString() ?? null,
          after: archivedAt?.toISOString() ?? null,
        },
      ],
    });
    return { ok: true, value: updated };
  });
}

async function organizationIdForGlossary(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  glossaryId: string,
) {
  const glossary = await tx.query.glossaries.findFirst({
    where: eq(schema.glossaries.id, glossaryId),
    columns: { organizationId: true },
  });
  if (!glossary) throw new Error("glossary_not_found");
  return glossary.organizationId;
}
