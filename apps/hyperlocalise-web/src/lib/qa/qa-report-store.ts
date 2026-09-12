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
import { and, desc, eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

import type { TranslationQaCheckType, TranslationQaScanCadence, TranslationQaSeverity } from "./types";

const emptySummary = {
  byCheckType: {},
  bySeverity: {},
  byLocale: {},
} as const;

export function emptyTranslationQaSummary() {
  return {
    byCheckType: { ...emptySummary.byCheckType },
    bySeverity: { ...emptySummary.bySeverity },
    byLocale: { ...emptySummary.byLocale },
  };
}

export async function listTranslationQaRuns(input: {
  organizationId: string;
  projectId: string;
  limit?: number;
}) {
  return db
    .select()
    .from(schema.translationQaRuns)
    .where(
      and(
        eq(schema.translationQaRuns.organizationId, input.organizationId),
        eq(schema.translationQaRuns.projectId, input.projectId),
      ),
    )
    .orderBy(desc(schema.translationQaRuns.createdAt))
    .limit(input.limit ?? 20);
}

export async function getTranslationQaRun(input: {
  organizationId: string;
  projectId: string;
  runId: string;
}) {
  const [run] = await db
    .select()
    .from(schema.translationQaRuns)
    .where(
      and(
        eq(schema.translationQaRuns.organizationId, input.organizationId),
        eq(schema.translationQaRuns.projectId, input.projectId),
        eq(schema.translationQaRuns.id, input.runId),
      ),
    )
    .limit(1);

  return run ?? null;
}

export async function listTranslationQaFindings(input: {
  organizationId: string;
  projectId: string;
  runId: string;
  locale?: string;
  checkType?: TranslationQaCheckType;
  severity?: TranslationQaSeverity;
  limit?: number;
  offset?: number;
}) {
  const filters = [
    eq(schema.translationQaFindings.organizationId, input.organizationId),
    eq(schema.translationQaFindings.projectId, input.projectId),
    eq(schema.translationQaFindings.runId, input.runId),
  ];
  if (input.locale) {
    filters.push(eq(schema.translationQaFindings.targetLocale, input.locale));
  }
  if (input.checkType) {
    filters.push(eq(schema.translationQaFindings.checkType, input.checkType));
  }
  if (input.severity) {
    filters.push(eq(schema.translationQaFindings.severity, input.severity));
  }

  const where = and(...filters);
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;

  const [findings, [countRow]] = await Promise.all([
    db
      .select()
      .from(schema.translationQaFindings)
      .where(where)
      .orderBy(schema.translationQaFindings.targetLocale, schema.translationQaFindings.key)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.translationQaFindings)
      .where(where),
  ]);

  return {
    findings,
    total: countRow?.count ?? 0,
    limit,
    offset,
  };
}

export async function listLatestTranslationQaRunsForOrganization(organizationId: string) {
  const latestRun = db
    .selectDistinctOn([schema.translationQaRuns.projectId], {
      id: schema.translationQaRuns.id,
      projectId: schema.translationQaRuns.projectId,
      status: schema.translationQaRuns.status,
      trigger: schema.translationQaRuns.trigger,
      segmentCount: schema.translationQaRuns.segmentCount,
      findingCount: schema.translationQaRuns.findingCount,
      errorCount: schema.translationQaRuns.errorCount,
      warningCount: schema.translationQaRuns.warningCount,
      summary: schema.translationQaRuns.summary,
      startedAt: schema.translationQaRuns.startedAt,
      completedAt: schema.translationQaRuns.completedAt,
      createdAt: schema.translationQaRuns.createdAt,
    })
    .from(schema.translationQaRuns)
    .where(eq(schema.translationQaRuns.organizationId, organizationId))
    .orderBy(schema.translationQaRuns.projectId, desc(schema.translationQaRuns.createdAt))
    .as("latest_qa_run");

  return db
    .select({
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      qaScanCadence: schema.projects.qaScanCadence,
      qaScanLastRunAt: schema.projects.qaScanLastRunAt,
      runId: latestRun.id,
      status: latestRun.status,
      trigger: latestRun.trigger,
      segmentCount: latestRun.segmentCount,
      findingCount: latestRun.findingCount,
      errorCount: latestRun.errorCount,
      warningCount: latestRun.warningCount,
      summary: latestRun.summary,
      startedAt: latestRun.startedAt,
      completedAt: latestRun.completedAt,
      createdAt: latestRun.createdAt,
    })
    .from(schema.projects)
    .leftJoin(latestRun, eq(latestRun.projectId, schema.projects.id))
    .where(
      and(eq(schema.projects.organizationId, organizationId), eq(schema.projects.source, "native")),
    )
    .orderBy(schema.projects.name);
}

export async function updateProjectQaScanCadence(input: {
  organizationId: string;
  projectId: string;
  cadence: TranslationQaScanCadence;
}) {
  const [project] = await db
    .update(schema.projects)
    .set({ qaScanCadence: input.cadence })
    .where(
      and(eq(schema.projects.organizationId, input.organizationId), eq(schema.projects.id, input.projectId)),
    )
    .returning({
      qaScanCadence: schema.projects.qaScanCadence,
      qaScanLastRunAt: schema.projects.qaScanLastRunAt,
    });

  return project ?? null;
}

export async function findActiveTranslationQaRun(input: {
  organizationId: string;
  projectId: string;
}) {
  const [run] = await db
    .select({ id: schema.translationQaRuns.id })
    .from(schema.translationQaRuns)
    .where(
      and(
        eq(schema.translationQaRuns.organizationId, input.organizationId),
        eq(schema.translationQaRuns.projectId, input.projectId),
        sql`${schema.translationQaRuns.status} in ('queued', 'running')`,
      ),
    )
    .limit(1);

  return run ?? null;
}
