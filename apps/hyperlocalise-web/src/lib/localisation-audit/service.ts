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
import { and, count, eq, gte } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import type { LocalisationAuditQueue } from "@/lib/workflow/types";

import { mintPrivateReportAccessToken } from "./access-token";
import {
  findReportForAudit,
  getAuditRecord,
  hashBudgetKey,
  markAuditFailed,
  safeAuditFromRecord,
} from "./operations";
import { normalizeAuditUrl } from "./parser";
import {
  loadPrivateLocalisationAuditReportByToken,
  loadPublicLocalisationAuditReportBySlug,
} from "./report-loaders";
import type {
  ConfirmAuditInput,
  LocalisationAuditError,
  PrepareAuditInput,
  PrivateAuditReport,
  PublicAuditReport,
  SafeAudit,
  UnlockAuditInput,
} from "./types";
import { LOCALISATION_AUDIT_REPORT_VERSION, LOCALISATION_AUDIT_SCORE_VERSION } from "./types";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const IP_RATE_LIMIT = 10;
const DOMAIN_RATE_LIMIT = 5;

export type LocalisationAuditService = {
  prepareAudit(input: PrepareAuditInput): Promise<Result<SafeAudit, LocalisationAuditError>>;
  getAudit(auditId: string): Promise<Result<SafeAudit, LocalisationAuditError>>;
  confirmAudit(input: ConfirmAuditInput): Promise<Result<SafeAudit, LocalisationAuditError>>;
  unlockAudit(
    input: UnlockAuditInput,
  ): Promise<Result<{ accessUrl: string }, LocalisationAuditError>>;
  getPublicReport(slug: string): Promise<Result<PublicAuditReport, LocalisationAuditError>>;
};

async function checkRateLimit(ipHash: string, domainHash: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const [ipCountRows, domainCountRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(schema.localisationAudits)
      .where(
        and(
          eq(schema.localisationAudits.ipHash, ipHash),
          gte(schema.localisationAudits.createdAt, windowStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(schema.localisationAudits)
      .where(
        and(
          eq(schema.localisationAudits.domainHash, domainHash),
          gte(schema.localisationAudits.createdAt, windowStart),
        ),
      ),
  ]);
  return (
    Number(ipCountRows[0]?.value ?? 0) < IP_RATE_LIMIT &&
    Number(domainCountRows[0]?.value ?? 0) < DOMAIN_RATE_LIMIT
  );
}

export function createLocalisationAuditService(options: {
  queue: LocalisationAuditQueue;
}): LocalisationAuditService {
  const { queue } = options;

  async function prepareAudit(
    input: PrepareAuditInput,
  ): Promise<Result<SafeAudit, LocalisationAuditError>> {
    const secret = env.LOCALISATION_AUDIT_ACCESS_SECRET;
    if (!secret) {
      return err({
        code: "audit_access_not_configured",
        message: "The localisation audit is not configured.",
      });
    }
    const normalizedUrl = normalizeAuditUrl(input.url);
    if (!normalizedUrl) {
      return err({ code: "invalid_audit_url", message: "Enter a valid HTTP(S) URL." });
    }
    const url = new URL(normalizedUrl);
    const domain = url.hostname.toLowerCase();
    const domainHash = hashBudgetKey(domain, secret);
    const ipHash = hashBudgetKey(input.ipAddress, secret);
    if (!(await checkRateLimit(ipHash, domainHash))) {
      return err({
        code: "audit_rate_limited",
        message: "The audit submission limit has been reached. Try again later.",
      });
    }

    const audit = await db.transaction(async (tx) => {
      const [createdAudit] = await tx
        .insert(schema.localisationAudits)
        .values({
          status: "preparing",
          submittedUrl: normalizedUrl,
          normalizedUrl,
          domain,
          domainHash,
          ipHash,
          scoreVersion: LOCALISATION_AUDIT_SCORE_VERSION,
          reportVersion: LOCALISATION_AUDIT_REPORT_VERSION,
        })
        .returning();
      if (!createdAudit) {
        throw new Error("Failed to persist localisation audit.");
      }
      await tx.insert(schema.localisationAuditEvents).values({
        auditId: createdAudit.id,
        eventType: "submitted",
        metadata: { source: "api" },
      });
      return createdAudit;
    });

    try {
      await queue.enqueuePrepare({ auditId: audit.id });
    } catch {
      await markAuditFailed(db, audit.id, "audit_queue_unavailable");
      return err({
        code: "audit_access_not_configured",
        message: "The localisation audit workflow is unavailable.",
      });
    }

    return ok(safeAuditFromRecord(audit));
  }

  async function getAudit(auditId: string): Promise<Result<SafeAudit, LocalisationAuditError>> {
    const audit = await getAuditRecord(db, auditId);
    if (!audit) {
      return err({ code: "audit_not_found", message: "The audit was not found." });
    }
    const report =
      audit.status === "completed" || audit.status === "partial"
        ? await findReportForAudit(db, audit.id)
        : null;
    return ok(safeAuditFromRecord(audit, report));
  }

  async function confirmAudit(
    input: ConfirmAuditInput,
  ): Promise<Result<SafeAudit, LocalisationAuditError>> {
    const audit = await getAuditRecord(db, input.auditId);
    if (!audit) {
      return err({ code: "audit_not_found", message: "The audit was not found." });
    }
    if (audit.status !== "awaiting_confirmation") {
      return err({
        code: "audit_not_awaiting_confirmation",
        message: "The audit cannot be confirmed in its current state.",
      });
    }

    const [primaryRecord] = await db
      .select({
        id: schema.localisationAuditPages.id,
        status: schema.localisationAuditPages.status,
        extraction: schema.localisationAuditPages.extraction,
        contentFingerprint: schema.localisationAuditPages.contentFingerprint,
      })
      .from(schema.localisationAuditPages)
      .where(
        and(
          eq(schema.localisationAuditPages.auditId, audit.id),
          eq(schema.localisationAuditPages.isPrimary, true),
        ),
      )
      .limit(1);
    if (
      !primaryRecord?.extraction ||
      !primaryRecord.contentFingerprint ||
      primaryRecord.status !== "extracted"
    ) {
      return err({
        code: "audit_fetch_failed",
        message: "The submitted page extraction is unavailable.",
      });
    }

    const [updatedAudit] = await db
      .update(schema.localisationAudits)
      .set({
        status: "running",
        targetLocale: input.targetLocale,
        targetMarket: input.targetMarket.toUpperCase(),
        confirmedAt: new Date(),
      })
      .where(eq(schema.localisationAudits.id, audit.id))
      .returning();
    if (!updatedAudit) {
      throw new Error("Failed to confirm localisation audit.");
    }
    await db.insert(schema.localisationAuditEvents).values({
      auditId: audit.id,
      eventType: "confirmed",
      metadata: { source: "api" },
    });

    try {
      await queue.enqueueRun({ auditId: audit.id });
    } catch {
      await markAuditFailed(db, audit.id, "audit_queue_unavailable");
      return err({
        code: "audit_access_not_configured",
        message: "The localisation audit workflow is unavailable.",
      });
    }

    return ok(safeAuditFromRecord(updatedAudit));
  }

  async function unlockAudit(
    input: UnlockAuditInput,
  ): Promise<Result<{ accessUrl: string }, LocalisationAuditError>> {
    const secret = env.LOCALISATION_AUDIT_ACCESS_SECRET;
    if (!secret) {
      return err({
        code: "audit_access_not_configured",
        message: "Private report access is not configured.",
      });
    }
    const audit = await getAuditRecord(db, input.auditId);
    if (!audit) {
      return err({ code: "audit_not_found", message: "The audit was not found." });
    }
    if (audit.status !== "completed" && audit.status !== "partial") {
      return err({
        code: "audit_not_complete",
        message: "The audit report is not ready to unlock.",
      });
    }
    const report = await findReportForAudit(db, audit.id);
    if (!report) {
      return err({ code: "report_not_found", message: "The report was not found." });
    }

    const token = mintPrivateReportAccessToken({
      auditId: audit.id,
      reportId: report.id,
      secret,
    });
    const accessUrl = `${input.origin.replace(/\/+$/, "")}/en/localisation-audit/report/${encodeURIComponent(token)}`;
    const [lead] = await db
      .insert(schema.localisationAuditLeads)
      .values({
        auditId: audit.id,
        email: input.email,
        name: input.name,
        emailDeliveryStatus: "pending",
      })
      .returning({ id: schema.localisationAuditLeads.id });
    if (!lead) {
      throw new Error("Failed to persist localisation audit lead.");
    }
    await db.insert(schema.localisationAuditEvents).values({
      auditId: audit.id,
      leadId: lead.id,
      eventType: "unlocked",
      metadata: { source: "api" },
    });

    try {
      await queue.enqueueDeliver({
        leadId: lead.id,
        accessUrl,
      });
    } catch {
      await db
        .update(schema.localisationAuditLeads)
        .set({ emailDeliveryStatus: "failed" })
        .where(eq(schema.localisationAuditLeads.id, lead.id));
      await db.insert(schema.localisationAuditEvents).values({
        auditId: audit.id,
        leadId: lead.id,
        eventType: "email_delivery_failed",
        metadata: { deliveryStatus: "failed" },
      });
      // Access URL remains usable even when email delivery enqueue fails.
    }

    return ok({ accessUrl });
  }

  async function getPublicReport(
    slug: string,
  ): Promise<Result<PublicAuditReport, LocalisationAuditError>> {
    const [report] = await db
      .select({ publicReport: schema.localisationAuditReports.publicReport })
      .from(schema.localisationAuditReports)
      .where(
        and(
          eq(schema.localisationAuditReports.publicSlug, slug),
          eq(schema.localisationAuditReports.visibility, "public"),
        ),
      )
      .limit(1);
    if (!report) {
      return err({ code: "report_not_found", message: "The report was not found." });
    }
    return ok(report.publicReport);
  }

  return {
    prepareAudit,
    getAudit,
    confirmAudit,
    unlockAudit,
    getPublicReport,
  };
}

export const localisationAuditService = createLocalisationAuditService({
  queue: {
    async enqueuePrepare(event) {
      const { createLocalisationAuditQueue } = await import("@/workflows/adapters");
      return createLocalisationAuditQueue().enqueuePrepare(event);
    },
    async enqueueRun(event) {
      const { createLocalisationAuditQueue } = await import("@/workflows/adapters");
      return createLocalisationAuditQueue().enqueueRun(event);
    },
    async enqueueDeliver(event) {
      const { createLocalisationAuditQueue } = await import("@/workflows/adapters");
      return createLocalisationAuditQueue().enqueueDeliver(event);
    },
  },
});

export async function getPublicAuditReportBySlug(slug: string): Promise<PublicAuditReport | null> {
  return loadPublicLocalisationAuditReportBySlug(slug);
}

export async function getPrivateAuditReportByToken(
  token: string,
): Promise<PrivateAuditReport | null> {
  const result = await loadPrivateLocalisationAuditReportByToken(token);
  return isErr(result) ? null : result.value;
}
