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
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import { hashLocalisationAuditReportToken, mintLocalisationAuditReportToken } from "./email-unlock";
import type {
  LocalisationAuditLeadDeliveryStatus,
  LocalisationAuditProgressStage,
  LocalisationAuditReport,
  LocalisationAuditStatus,
  LocalisationAuditTeaser,
} from "./types";
import { LOCALISATION_AUDIT_EMAIL_RESEND_COOLDOWN_MS, LOCALISATION_AUDIT_STALE_MS } from "./types";

export type LocalisationAuditRow = typeof schema.localisationAudits.$inferSelect;
export type LocalisationAuditLeadRow = typeof schema.localisationAuditLeads.$inferSelect;

export type ClaimLocalisationAuditOutcome =
  | "reused_success"
  | "reused_active"
  | "reclaimed"
  | "created";

function now() {
  return new Date();
}

function isActiveAudit(audit: LocalisationAuditRow, staleMs = LOCALISATION_AUDIT_STALE_MS) {
  if (audit.status !== "queued" && audit.status !== "running") {
    return false;
  }
  const reference =
    audit.statusUpdatedAt ?? audit.lastAttemptAt ?? audit.updatedAt ?? audit.createdAt;
  return Date.now() - reference.getTime() < staleMs;
}

export function isLocalisationAuditRetryable(audit: LocalisationAuditRow) {
  if (audit.status === "failed") return true;
  if (audit.status === "succeeded") return audit.report == null;
  if (audit.status === "queued" || audit.status === "running") {
    return !isActiveAudit(audit);
  }
  return false;
}

export async function findLocalisationAuditBySlug(domainSlug: string) {
  const [row] = await db
    .select()
    .from(schema.localisationAudits)
    .where(eq(schema.localisationAudits.domainSlug, domainSlug))
    .limit(1);
  return row ?? null;
}

export async function findLocalisationAuditByDomainKey(domainKey: string) {
  const [row] = await db
    .select()
    .from(schema.localisationAudits)
    .where(eq(schema.localisationAudits.domainKey, domainKey))
    .limit(1);
  return row ?? null;
}

export async function findLocalisationAuditById(auditId: string) {
  const [row] = await db
    .select()
    .from(schema.localisationAudits)
    .where(eq(schema.localisationAudits.id, auditId))
    .limit(1);
  return row ?? null;
}

export async function listCompletedLocalisationAuditSlugs(limit = 200) {
  const rows = await db
    .select({
      domainSlug: schema.localisationAudits.domainSlug,
      completedAt: schema.localisationAudits.completedAt,
    })
    .from(schema.localisationAudits)
    .where(
      and(
        eq(schema.localisationAudits.status, "succeeded"),
        isNotNull(schema.localisationAudits.completedAt),
      ),
    )
    .orderBy(desc(schema.localisationAudits.completedAt))
    .limit(limit);
  return rows;
}

export type LocalisationAuditLeaderboardEntry = {
  rank: number;
  domainKey: string;
  domainSlug: string;
  score: number;
  completedAt: Date | null;
};

/**
 * Public leaderboard of succeeded teaser scores (highest first).
 * Only exposes domain identity + score — never emails or full reports.
 */
export async function listLocalisationAuditLeaderboard(limit = 25) {
  const rows = await db
    .select({
      domainKey: schema.localisationAudits.domainKey,
      domainSlug: schema.localisationAudits.domainSlug,
      score: schema.localisationAudits.score,
      completedAt: schema.localisationAudits.completedAt,
    })
    .from(schema.localisationAudits)
    .where(
      and(
        eq(schema.localisationAudits.status, "succeeded"),
        isNotNull(schema.localisationAudits.score),
        isNotNull(schema.localisationAudits.teaser),
      ),
    )
    .orderBy(
      desc(schema.localisationAudits.score),
      desc(schema.localisationAudits.completedAt),
      asc(schema.localisationAudits.domainKey),
    )
    .limit(limit);

  return rows.flatMap((row, index) => {
    if (row.score == null) return [];
    return [
      {
        rank: index + 1,
        domainKey: row.domainKey,
        domainSlug: row.domainSlug,
        score: row.score,
        completedAt: row.completedAt,
      } satisfies LocalisationAuditLeaderboardEntry,
    ];
  });
}

export type LocalisationAuditStanding = {
  rank: number;
  total: number;
  score: number;
  percentile: number;
  averageScore: number | null;
};

/** Rank/percentile for a succeeded audit among all public teaser scores. */
export async function getLocalisationAuditStanding(input: {
  domainSlug: string;
  score: number;
}): Promise<LocalisationAuditStanding | null> {
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      averageScore: sql<number | null>`avg(${schema.localisationAudits.score})`,
      betterOrEqual: sql<number>`count(*) filter (where ${schema.localisationAudits.score} > ${input.score})::int`,
    })
    .from(schema.localisationAudits)
    .where(
      and(
        eq(schema.localisationAudits.status, "succeeded"),
        isNotNull(schema.localisationAudits.score),
        isNotNull(schema.localisationAudits.teaser),
      ),
    );

  const total = stats?.total ?? 0;
  if (total === 0) return null;

  const rank = (stats?.betterOrEqual ?? 0) + 1;
  const percentile = Math.max(1, Math.min(99, Math.round(((total - rank + 1) / total) * 100)));
  const averageScore = stats?.averageScore == null ? null : Math.round(Number(stats.averageScore));

  return {
    rank,
    total,
    score: input.score,
    percentile,
    averageScore,
  };
}

async function createLocalisationAudit(input: {
  domainKey: string;
  domainSlug: string;
  sourceUrl: string;
  focusLocales: string[];
}) {
  const timestamp = now();
  const [row] = await db
    .insert(schema.localisationAudits)
    .values({
      domainKey: input.domainKey,
      domainSlug: input.domainSlug,
      sourceUrl: input.sourceUrl,
      focusLocales: input.focusLocales,
      status: "queued",
      attemptNumber: 1,
      progressStage: "queued",
      statusUpdatedAt: timestamp,
      lastAttemptAt: timestamp,
    })
    .returning();
  if (!row) {
    throw new Error("failed to create localisation audit");
  }
  return row;
}

/**
 * Atomically reuse a successful/active audit or reclaim a failed/stale one for a new attempt.
 */
export async function claimOrReuseLocalisationAudit(input: {
  domainKey: string;
  domainSlug: string;
  sourceUrl: string;
  focusLocales: string[];
  /** Internal retry budget after reclaim races. */
  _reclaimAttempts?: number;
}): Promise<{ audit: LocalisationAuditRow; outcome: ClaimLocalisationAuditOutcome }> {
  const reclaimAttempts = input._reclaimAttempts ?? 0;
  const existing = await findLocalisationAuditByDomainKey(input.domainKey);
  if (!existing) {
    try {
      const created = await createLocalisationAudit(input);
      return { audit: created, outcome: "created" };
    } catch {
      const raced = await findLocalisationAuditByDomainKey(input.domainKey);
      if (!raced) {
        throw new Error("failed to create localisation audit");
      }
      return claimOrReuseLocalisationAudit(input);
    }
  }

  if (existing.status === "succeeded" && existing.report) {
    return { audit: existing, outcome: "reused_success" };
  }

  if (isActiveAudit(existing)) {
    return { audit: existing, outcome: "reused_active" };
  }

  const timestamp = now();
  const staleCutoff = new Date(Date.now() - LOCALISATION_AUDIT_STALE_MS);
  const focusLocales =
    input.focusLocales.length > 0 ? input.focusLocales : (existing.focusLocales ?? []);

  const [claimed] = await db
    .update(schema.localisationAudits)
    .set({
      sourceUrl: input.sourceUrl,
      focusLocales,
      status: "queued" satisfies LocalisationAuditStatus,
      attemptNumber: sql`${schema.localisationAudits.attemptNumber} + 1`,
      progressStage: "queued" satisfies LocalisationAuditProgressStage,
      statusUpdatedAt: timestamp,
      lastAttemptAt: timestamp,
      workflowRunId: null,
      score: null,
      teaser: null,
      report: null,
      errorCode: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    })
    .where(
      and(
        eq(schema.localisationAudits.id, existing.id),
        or(
          eq(schema.localisationAudits.status, "failed"),
          and(
            eq(schema.localisationAudits.status, "succeeded"),
            isNull(schema.localisationAudits.report),
          ),
          and(
            inArray(schema.localisationAudits.status, ["queued", "running"]),
            lt(schema.localisationAudits.statusUpdatedAt, staleCutoff),
          ),
        ),
      ),
    )
    .returning();

  if (claimed) {
    return { audit: claimed, outcome: "reclaimed" };
  }

  const fresh = await findLocalisationAuditByDomainKey(input.domainKey);
  if (!fresh) {
    throw new Error("localisation audit disappeared during claim");
  }
  if (fresh.status === "succeeded" && fresh.report) {
    return { audit: fresh, outcome: "reused_success" };
  }
  // Succeeded-without-report (or other retryable states) must not stick as "active".
  if (isLocalisationAuditRetryable(fresh) && reclaimAttempts < 3) {
    return claimOrReuseLocalisationAudit({ ...input, _reclaimAttempts: reclaimAttempts + 1 });
  }
  return { audit: fresh, outcome: "reused_active" };
}

export async function attachLocalisationAuditWorkflowRun(input: {
  auditId: string;
  attemptNumber: number;
  workflowRunId: string;
}) {
  await db
    .update(schema.localisationAudits)
    .set({
      workflowRunId: input.workflowRunId,
      statusUpdatedAt: now(),
    })
    .where(
      and(
        eq(schema.localisationAudits.id, input.auditId),
        eq(schema.localisationAudits.attemptNumber, input.attemptNumber),
      ),
    );
}

export async function markLocalisationAuditProgress(input: {
  auditId: string;
  attemptNumber: number;
  progressStage: LocalisationAuditProgressStage;
  status?: LocalisationAuditStatus;
}) {
  const timestamp = now();
  const [row] = await db
    .update(schema.localisationAudits)
    .set({
      progressStage: input.progressStage,
      ...(input.status
        ? {
            status: input.status,
            ...(input.status === "running" ? { startedAt: timestamp } : {}),
          }
        : {}),
      statusUpdatedAt: timestamp,
      errorCode: null,
      errorMessage: null,
    })
    .where(
      and(
        eq(schema.localisationAudits.id, input.auditId),
        eq(schema.localisationAudits.attemptNumber, input.attemptNumber),
      ),
    )
    .returning();
  return row ?? null;
}

export async function markLocalisationAuditRunning(input: {
  auditId: string;
  attemptNumber: number;
}) {
  return markLocalisationAuditProgress({
    auditId: input.auditId,
    attemptNumber: input.attemptNumber,
    progressStage: "preparing",
    status: "running",
  });
}

export async function completeLocalisationAudit(input: {
  auditId: string;
  attemptNumber: number;
  score: number;
  teaser: LocalisationAuditTeaser;
  report: LocalisationAuditReport;
}) {
  const timestamp = now();
  const [row] = await db
    .update(schema.localisationAudits)
    .set({
      status: "succeeded" satisfies LocalisationAuditStatus,
      progressStage: "completed" satisfies LocalisationAuditProgressStage,
      score: input.score,
      teaser: input.teaser,
      report: input.report,
      completedAt: timestamp,
      statusUpdatedAt: timestamp,
      errorCode: null,
      errorMessage: null,
    })
    .where(
      and(
        eq(schema.localisationAudits.id, input.auditId),
        eq(schema.localisationAudits.attemptNumber, input.attemptNumber),
      ),
    )
    .returning();
  return row ?? null;
}

export async function failLocalisationAudit(input: {
  auditId: string;
  attemptNumber: number;
  errorCode: string;
  errorMessage: string;
}) {
  const timestamp = now();
  const [row] = await db
    .update(schema.localisationAudits)
    .set({
      status: "failed" satisfies LocalisationAuditStatus,
      progressStage: "failed" satisfies LocalisationAuditProgressStage,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      completedAt: timestamp,
      statusUpdatedAt: timestamp,
    })
    .where(
      and(
        eq(schema.localisationAudits.id, input.auditId),
        eq(schema.localisationAudits.attemptNumber, input.attemptNumber),
      ),
    )
    .returning();
  return row ?? null;
}

export async function findLocalisationAuditLeadById(leadId: string) {
  const [row] = await db
    .select()
    .from(schema.localisationAuditLeads)
    .where(eq(schema.localisationAuditLeads.id, leadId))
    .limit(1);
  return row ?? null;
}

export async function findLocalisationAuditLead(input: { auditId: string; email: string }) {
  const email = input.email.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(schema.localisationAuditLeads)
    .where(
      and(
        eq(schema.localisationAuditLeads.auditId, input.auditId),
        eq(schema.localisationAuditLeads.email, email),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listPendingLocalisationAuditLeads(auditId: string) {
  const staleQueuedCutoff = new Date(Date.now() - LOCALISATION_AUDIT_EMAIL_RESEND_COOLDOWN_MS);
  return db
    .select()
    .from(schema.localisationAuditLeads)
    .where(
      and(
        eq(schema.localisationAuditLeads.auditId, auditId),
        or(
          inArray(schema.localisationAuditLeads.deliveryStatus, ["pending", "failed"]),
          and(
            eq(schema.localisationAuditLeads.deliveryStatus, "queued"),
            or(
              isNull(schema.localisationAuditLeads.lastEmailQueuedAt),
              lt(schema.localisationAuditLeads.lastEmailQueuedAt, staleQueuedCutoff),
            ),
          ),
        ),
      ),
    );
}

export type UpsertLocalisationAuditLeadResult = {
  lead: LocalisationAuditLeadRow;
  token: string;
  created: boolean;
  resendAllowed: boolean;
  cooldownMsRemaining: number;
};

/**
 * Store/refresh a lead with a fresh opaque report token. Does not unlock the report.
 */
export async function upsertLocalisationAuditLeadForDelivery(input: {
  auditId: string;
  email: string;
  locale: string;
  forceResend?: boolean;
}): Promise<UpsertLocalisationAuditLeadResult> {
  const email = input.email.trim().toLowerCase();
  let existing = await findLocalisationAuditLead({ auditId: input.auditId, email });
  const minted = mintLocalisationAuditReportToken();
  const timestamp = now();

  if (!existing) {
    const [created] = await db
      .insert(schema.localisationAuditLeads)
      .values({
        auditId: input.auditId,
        email,
        locale: input.locale,
        deliveryStatus: "pending",
        tokenHash: minted.tokenHash,
        tokenExpiresAt: minted.expiresAt,
      })
      .onConflictDoNothing({
        target: [schema.localisationAuditLeads.auditId, schema.localisationAuditLeads.email],
      })
      .returning();
    if (created) {
      return {
        lead: created,
        token: minted.token,
        created: true,
        resendAllowed: true,
        cooldownMsRemaining: 0,
      };
    }

    existing = await findLocalisationAuditLead({ auditId: input.auditId, email });
    if (!existing) {
      throw new Error("failed to create localisation audit lead");
    }
  }

  const lastQueued = existing.lastEmailQueuedAt?.getTime() ?? existing.emailSentAt?.getTime() ?? 0;
  const elapsed = Date.now() - lastQueued;
  const cooldownMsRemaining = Math.max(0, LOCALISATION_AUDIT_EMAIL_RESEND_COOLDOWN_MS - elapsed);
  const resendAllowed =
    input.forceResend === true ||
    existing.deliveryStatus === "pending" ||
    existing.deliveryStatus === "failed" ||
    cooldownMsRemaining === 0;

  if (!resendAllowed) {
    return {
      lead: existing,
      token: "",
      created: false,
      resendAllowed: false,
      cooldownMsRemaining,
    };
  }

  const [updated] = await db
    .update(schema.localisationAuditLeads)
    .set({
      locale: input.locale,
      deliveryStatus: "pending" satisfies LocalisationAuditLeadDeliveryStatus,
      tokenHash: minted.tokenHash,
      tokenExpiresAt: minted.expiresAt,
      emailError: null,
      verifiedAt: null,
      updatedAt: timestamp,
    })
    .where(eq(schema.localisationAuditLeads.id, existing.id))
    .returning();

  return {
    lead: updated ?? existing,
    token: minted.token,
    created: false,
    resendAllowed: true,
    cooldownMsRemaining: 0,
  };
}

export async function markLocalisationAuditLeadEmailQueued(leadId: string) {
  const timestamp = now();
  const [row] = await db
    .update(schema.localisationAuditLeads)
    .set({
      deliveryStatus: "queued" satisfies LocalisationAuditLeadDeliveryStatus,
      lastEmailQueuedAt: timestamp,
      emailError: null,
      updatedAt: timestamp,
    })
    .where(eq(schema.localisationAuditLeads.id, leadId))
    .returning();
  return row ?? null;
}

export async function markLocalisationAuditLeadEmailSent(leadId: string) {
  const timestamp = now();
  const [row] = await db
    .update(schema.localisationAuditLeads)
    .set({
      deliveryStatus: "sent" satisfies LocalisationAuditLeadDeliveryStatus,
      emailSentAt: timestamp,
      emailError: null,
      updatedAt: timestamp,
    })
    .where(eq(schema.localisationAuditLeads.id, leadId))
    .returning();
  return row ?? null;
}

export async function markLocalisationAuditLeadEmailFailed(input: {
  leadId: string;
  error: string;
}) {
  const timestamp = now();
  const [row] = await db
    .update(schema.localisationAuditLeads)
    .set({
      deliveryStatus: "failed" satisfies LocalisationAuditLeadDeliveryStatus,
      emailError: input.error.slice(0, 500),
      updatedAt: timestamp,
    })
    .where(eq(schema.localisationAuditLeads.id, input.leadId))
    .returning();
  return row ?? null;
}

/**
 * Validates a report token without burning it.
 * Marks the lead verified on first success; the same token remains usable until expiry
 * so email security scanners cannot invalidate the recipient's link.
 */
export async function verifyLocalisationAuditReportToken(input: {
  domainSlug: string;
  token: string;
}): Promise<{ lead: LocalisationAuditLeadRow; audit: LocalisationAuditRow } | null> {
  const tokenHash = hashLocalisationAuditReportToken(input.token);
  const [row] = await db
    .select({
      lead: schema.localisationAuditLeads,
      audit: schema.localisationAudits,
    })
    .from(schema.localisationAuditLeads)
    .innerJoin(
      schema.localisationAudits,
      eq(schema.localisationAuditLeads.auditId, schema.localisationAudits.id),
    )
    .where(
      and(
        eq(schema.localisationAudits.domainSlug, input.domainSlug),
        eq(schema.localisationAuditLeads.tokenHash, tokenHash),
      ),
    )
    .limit(1);

  if (!row) return null;
  if (!row.lead.tokenExpiresAt || row.lead.tokenExpiresAt.getTime() < Date.now()) {
    return null;
  }

  if (row.lead.deliveryStatus === "verified") {
    return { lead: row.lead, audit: row.audit };
  }

  const timestamp = now();
  const [verified] = await db
    .update(schema.localisationAuditLeads)
    .set({
      deliveryStatus: "verified" satisfies LocalisationAuditLeadDeliveryStatus,
      verifiedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(schema.localisationAuditLeads.id, row.lead.id),
        eq(schema.localisationAuditLeads.tokenHash, tokenHash),
        inArray(schema.localisationAuditLeads.deliveryStatus, [
          "pending",
          "queued",
          "sent",
          "failed",
        ]),
      ),
    )
    .returning();

  if (!verified) {
    // Race: another request verified first; re-read.
    const [fresh] = await db
      .select()
      .from(schema.localisationAuditLeads)
      .where(eq(schema.localisationAuditLeads.id, row.lead.id))
      .limit(1);
    if (!fresh || fresh.deliveryStatus !== "verified") return null;
    return { lead: fresh, audit: row.audit };
  }
  return { lead: verified, audit: row.audit };
}
