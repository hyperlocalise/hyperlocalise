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
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

import type { LocalisationAuditCrawledPage, LocalisationAuditDimensionScores } from "../types";
import type { DeepAuditFindingRecord } from "./findings";
import {
  LOCALISATION_DEEP_AUDIT_IN_FLIGHT_STATUSES,
  type LocalisationDeepAuditStatus,
  type LocalisationDeepAuditSummary,
} from "./types";

const FINDING_INSERT_CHUNK = 500;

/** Upper bound on stored findings per run; scorers emit at most a few per page. */
export const LOCALISATION_DEEP_AUDIT_MAX_FINDINGS = 5_000;

const runs = schema.localisationDeepAudits;
const pages = schema.localisationDeepAuditPages;
const findings = schema.localisationDeepAuditFindings;

export async function findDeepAuditRunWithDomain(runId: string) {
  const [row] = await db
    .select({
      run: runs,
      domain: {
        id: schema.linkedDomains.id,
        status: schema.linkedDomains.status,
        sourceUrl: schema.linkedDomains.sourceUrl,
        domainKey: schema.linkedDomains.domainKey,
        organizationId: schema.linkedDomains.organizationId,
      },
    })
    .from(runs)
    .innerJoin(schema.linkedDomains, eq(schema.linkedDomains.id, runs.linkedDomainId))
    .where(eq(runs.id, runId))
    .limit(1);
  return row ?? null;
}

export async function getDeepAuditStatus(
  runId: string,
): Promise<LocalisationDeepAuditStatus | null> {
  const [row] = await db
    .select({ status: runs.status })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);
  return row?.status ?? null;
}

/** Store the workflow run id once; a retried start must not overwrite it. */
export async function setDeepAuditWorkflowRunId(runId: string, workflowRunId: string) {
  await db
    .update(runs)
    .set({ workflowRunId })
    .where(and(eq(runs.id, runId), sql`${runs.workflowRunId} is null`));
}

export async function markDeepAuditCrawling(runId: string) {
  const [row] = await db
    .update(runs)
    .set({ status: "crawling", startedAt: new Date() })
    .where(and(eq(runs.id, runId), eq(runs.status, "queued")))
    .returning({ id: runs.id });
  return row != null;
}

export async function setDeepAuditPagesDiscovered(runId: string, pagesDiscovered: number) {
  await db
    .update(runs)
    .set({ pagesDiscovered })
    .where(and(eq(runs.id, runId), eq(runs.status, "crawling")));
}

export type DeepAuditPageInsert = {
  url: string;
  locale: string | null;
  templateKey: string;
  artifact: LocalisationAuditCrawledPage;
};

/**
 * Persist rendered pages and bump the rendered count. Writes only while the
 * run is crawling, so a cancelled run stops accepting pages.
 */
export async function insertDeepAuditPages(input: {
  runId: string;
  organizationId: string;
  pages: DeepAuditPageInsert[];
}): Promise<{ inserted: number; accepted: boolean }> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ status: runs.status })
      .from(runs)
      .where(eq(runs.id, input.runId))
      .for("update");
    if (locked?.status !== "crawling") {
      return { inserted: 0, accepted: false };
    }
    if (input.pages.length === 0) {
      return { inserted: 0, accepted: true };
    }
    const inserted = await tx
      .insert(pages)
      .values(
        input.pages.map((page) => ({
          runId: input.runId,
          organizationId: input.organizationId,
          url: page.url,
          finalUrl: page.artifact.url,
          httpStatus: page.artifact.status,
          locale: page.locale,
          templateKey: page.templateKey,
          artifact: page.artifact,
        })),
      )
      .onConflictDoNothing({ target: [pages.runId, pages.url] })
      .returning({ id: pages.id });
    if (inserted.length > 0) {
      await tx
        .update(runs)
        .set({ pagesRendered: sql`${runs.pagesRendered} + ${inserted.length}` })
        .where(eq(runs.id, input.runId));
    }
    return { inserted: inserted.length, accepted: true };
  });
}

export async function listDeepAuditPages(runId: string) {
  return db
    .select({
      url: pages.url,
      locale: pages.locale,
      templateKey: pages.templateKey,
      artifact: pages.artifact,
    })
    .from(pages)
    .where(eq(pages.runId, runId))
    .orderBy(asc(pages.createdAt), asc(pages.url));
}

export async function markDeepAuditScoring(runId: string) {
  const [row] = await db
    .update(runs)
    .set({ status: "scoring" })
    .where(and(eq(runs.id, runId), eq(runs.status, "crawling")))
    .returning({ id: runs.id });
  return row != null;
}

/** Latest succeeded run for the same domain, with its finding fingerprints. */
export async function findPreviousDeepAuditFingerprints(input: {
  linkedDomainId: string;
  runId: string;
}): Promise<{ runId: string; fingerprints: Set<string> } | null> {
  const [previous] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(
      and(
        eq(runs.linkedDomainId, input.linkedDomainId),
        eq(runs.status, "succeeded"),
        ne(runs.id, input.runId),
      ),
    )
    .orderBy(desc(runs.completedAt))
    .limit(1);
  if (!previous) return null;
  const rows = await db
    .select({ fingerprint: findings.fingerprint })
    .from(findings)
    .where(eq(findings.runId, previous.id));
  return { runId: previous.id, fingerprints: new Set(rows.map((row) => row.fingerprint)) };
}

/**
 * Write findings and the summary, then mark the run succeeded. Rolls back when
 * the run is no longer scoring (cancelled while scoring).
 */
export async function completeDeepAudit(input: {
  runId: string;
  organizationId: string;
  score: number;
  dimensionScores: LocalisationAuditDimensionScores;
  summary: LocalisationDeepAuditSummary;
  previousRunId: string | null;
  findings: DeepAuditFindingRecord[];
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ status: runs.status })
      .from(runs)
      .where(eq(runs.id, input.runId))
      .for("update");
    if (locked?.status !== "scoring") {
      return false;
    }
    await tx.delete(findings).where(eq(findings.runId, input.runId));
    const rows = input.findings.slice(0, LOCALISATION_DEEP_AUDIT_MAX_FINDINGS);
    for (let index = 0; index < rows.length; index += FINDING_INSERT_CHUNK) {
      await tx.insert(findings).values(
        rows.slice(index, index + FINDING_INSERT_CHUNK).map((record) => ({
          runId: input.runId,
          organizationId: input.organizationId,
          ...record,
        })),
      );
    }
    await tx
      .update(runs)
      .set({
        status: "succeeded",
        score: input.score,
        dimensionScores: input.dimensionScores,
        summary: input.summary,
        previousRunId: input.previousRunId,
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      })
      .where(eq(runs.id, input.runId));
    return true;
  });
}

export async function failDeepAudit(input: {
  runId: string;
  errorCode: string;
  errorMessage: string;
}) {
  await db
    .update(runs)
    .set({
      status: "failed",
      errorCode: input.errorCode,
      errorMessage: input.errorMessage.slice(0, 500),
      completedAt: new Date(),
    })
    .where(
      and(
        eq(runs.id, input.runId),
        inArray(runs.status, [...LOCALISATION_DEEP_AUDIT_IN_FLIGHT_STATUSES]),
      ),
    );
}
