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
import { Hono } from "hono";
import { setCookie } from "hono/cookie";

import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
  tooManyRequestsResponse,
} from "@/api/response.schema";
import { LOCALISATION_AUDIT_ANALYTICS_EVENTS, scoreBand } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { rejectLocalisationAuditBot } from "@/lib/localisation-audit/bot-protection";
import { LocalisationAuditDailyQuotaExceededError } from "@/lib/localisation-audit/daily-quota";
import { resolveDomainIdentity, isValidDomainSlug } from "@/lib/localisation-audit/domain-slug";
import {
  localisationAuditUnlockCookieName,
  signLocalisationAuditUnlock,
} from "@/lib/localisation-audit/email-unlock";
import {
  attachLocalisationAuditWorkflowRun,
  claimOrReuseLocalisationAudit,
  failLocalisationAudit,
  findLocalisationAuditBySlug,
  isLocalisationAuditRetryable,
  isLocalisationAuditRerunnable,
  localisationAuditRerunAvailableAt,
  markLocalisationAuditLeadEmailFailed,
  markLocalisationAuditLeadEmailQueued,
  upsertLocalisationAuditLeadForDelivery,
  verifyLocalisationAuditReportToken,
  type LocalisationAuditRow,
} from "@/lib/localisation-audit/store";
import { isErr } from "@/lib/primitives/result/results";
import { assertResolvablePublicHttpUrl } from "@/lib/security/public-http-fetch";
import { formatSsrfGuardError } from "@/lib/security/ssrf-guard";
import type {
  LocalisationAuditQueue,
  LocalisationAuditReportEmailQueue,
} from "@/lib/workflow/types";
import {
  createLocalisationAuditQueue,
  createLocalisationAuditReportEmailQueue,
} from "@/workflows/adapters";

import {
  startLocalisationAuditBodySchema,
  unlockLocalisationAuditBodySchema,
} from "./localisation-audit.schema";

type LocalisationAuditRouteOptions = {
  localisationAuditQueue?: LocalisationAuditQueue;
  localisationAuditReportEmailQueue?: LocalisationAuditReportEmailQueue;
};

function publicAuditView(audit: LocalisationAuditRow) {
  const retryable = isLocalisationAuditRetryable(audit);
  return {
    id: audit.id,
    domainKey: audit.domainKey,
    domainSlug: audit.domainSlug,
    sourceUrl: audit.sourceUrl,
    status: audit.status,
    attemptNumber: audit.attemptNumber,
    progressStage: audit.progressStage,
    score: audit.score,
    focusLocales: audit.focusLocales,
    teaser: audit.teaser,
    errorCode: audit.errorCode,
    errorMessage: audit.errorMessage,
    retryable,
    rerunnable: isLocalisationAuditRerunnable(audit),
    rerunAvailableAt: localisationAuditRerunAvailableAt(audit)?.toISOString() ?? null,
    createdAt: audit.createdAt.toISOString(),
    completedAt: audit.completedAt?.toISOString() ?? null,
    statusUpdatedAt: audit.statusUpdatedAt?.toISOString() ?? null,
  };
}

export function createLocalisationAuditRoutes(options: LocalisationAuditRouteOptions = {}) {
  const queue = options.localisationAuditQueue ?? createLocalisationAuditQueue();
  const reportEmailQueue =
    options.localisationAuditReportEmailQueue ?? createLocalisationAuditReportEmailQueue();

  return new Hono()
    .post("/", async (c) => {
      const botRejection = await rejectLocalisationAuditBot(c);
      if (botRejection) return botRejection;

      const parsed = startLocalisationAuditBodySchema.safeParse(
        await c.req.json().catch(() => null),
      );
      if (!parsed.success) {
        return badRequestResponse(c, "invalid_localisation_audit_payload", "URL is required");
      }

      const identity = resolveDomainIdentity(parsed.data.url);
      if (isErr(identity)) {
        if (identity.error.code === "empty_slug") {
          return badRequestResponse(
            c,
            "invalid_domain_slug",
            "Could not build a valid domain slug from that URL.",
          );
        }
        return badRequestResponse(c, identity.error.code, formatSsrfGuardError(identity.error));
      }

      const resolvable = await assertResolvablePublicHttpUrl(identity.value.sourceUrl);
      if (isErr(resolvable)) {
        return badRequestResponse(c, resolvable.error.code, formatSsrfGuardError(resolvable.error));
      }

      const focusLocales = (parsed.data.focusLocales ?? [])
        .map((locale) => locale.trim())
        .filter(Boolean)
        .slice(0, 2);

      let claim;
      try {
        claim = await claimOrReuseLocalisationAudit({
          domainKey: identity.value.domainKey,
          domainSlug: identity.value.domainSlug,
          sourceUrl: identity.value.sourceUrl,
          focusLocales,
        });
      } catch (error) {
        if (error instanceof LocalisationAuditDailyQuotaExceededError) {
          return tooManyRequestsResponse(c, error.code, error.message);
        }
        return conflictResponse(c, "localisation_audit_create_failed", "Could not create audit");
      }

      if (claim.outcome === "reused_success" || claim.outcome === "reused_active") {
        serverAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.reuse, {
          outcome: claim.outcome,
          status: claim.audit.status,
        });
        return c.json(
          {
            audit: publicAuditView(claim.audit),
            reused: true,
            outcome: claim.outcome,
          },
          200,
        );
      }

      try {
        const enqueued = await queue.enqueue({
          auditId: claim.audit.id,
          attemptNumber: claim.audit.attemptNumber,
        });
        const workflowRunId = enqueued.ids[0];
        if (workflowRunId) {
          await attachLocalisationAuditWorkflowRun({
            auditId: claim.audit.id,
            attemptNumber: claim.audit.attemptNumber,
            workflowRunId,
          });
        }
      } catch {
        await failLocalisationAudit({
          auditId: claim.audit.id,
          attemptNumber: claim.audit.attemptNumber,
          errorCode: "localisation_audit_enqueue_failed",
          errorMessage: "Audit could not be queued. You can retry shortly.",
        });
        return conflictResponse(
          c,
          "localisation_audit_enqueue_failed",
          "Audit could not be queued. You can retry shortly.",
        );
      }

      const eventName =
        claim.outcome === "reclaimed"
          ? LOCALISATION_AUDIT_ANALYTICS_EVENTS.retry
          : LOCALISATION_AUDIT_ANALYTICS_EVENTS.start;
      serverAnalytics.track(eventName, {
        outcome: claim.outcome,
        status: "queued",
      });

      const fresh = await findLocalisationAuditBySlug(claim.audit.domainSlug);
      return c.json(
        {
          audit: publicAuditView(fresh ?? claim.audit),
          reused: false,
          outcome: claim.outcome,
        },
        claim.outcome === "created" ? 201 : 200,
      );
    })
    .get("/:domainSlug", async (c) => {
      const domainSlug = c.req.param("domainSlug");
      if (!isValidDomainSlug(domainSlug)) {
        return badRequestResponse(c, "invalid_domain_slug", "Domain slug is invalid");
      }

      const audit = await findLocalisationAuditBySlug(domainSlug);
      if (!audit) {
        return notFoundResponse(c, "localisation_audit_not_found");
      }

      const publicReport = audit.status === "succeeded";

      return c.json({
        audit: {
          ...publicAuditView(audit),
          unlocked: publicReport,
          report: publicReport ? audit.report : null,
        },
      });
    })
    .post("/:domainSlug/unlock", async (c) => {
      const botRejection = await rejectLocalisationAuditBot(c);
      if (botRejection) return botRejection;

      const domainSlug = c.req.param("domainSlug");
      if (!isValidDomainSlug(domainSlug)) {
        return badRequestResponse(c, "invalid_domain_slug", "Domain slug is invalid");
      }

      const parsed = unlockLocalisationAuditBodySchema.safeParse(
        await c.req.json().catch(() => null),
      );
      if (!parsed.success) {
        return badRequestResponse(c, "invalid_email", "A valid email is required");
      }

      const audit = await findLocalisationAuditBySlug(domainSlug);
      if (!audit) {
        return notFoundResponse(c, "localisation_audit_not_found");
      }

      if (audit.status === "failed") {
        return conflictResponse(
          c,
          "localisation_audit_failed",
          "This audit failed. Retry the audit before requesting a report email.",
        );
      }

      const locale =
        normalizeAppLocale(parsed.data.locale ?? DEFAULT_APP_LOCALE) ?? DEFAULT_APP_LOCALE;
      const upsert = await upsertLocalisationAuditLeadForDelivery({
        auditId: audit.id,
        email: parsed.data.email,
        locale,
      });

      if (!upsert.resendAllowed) {
        return tooManyRequestsResponse(
          c,
          "localisation_audit_email_cooldown",
          "Please wait before requesting another report email.",
        );
      }

      serverAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.reportEmailRequest, {
        delivery: audit.status === "succeeded" ? "immediate" : "pending",
        status: audit.status,
      });

      const publicReport = audit.status === "succeeded";

      if (audit.status === "succeeded" && audit.report) {
        await markLocalisationAuditLeadEmailQueued(upsert.lead.id);
        try {
          await reportEmailQueue.enqueue({
            leadId: upsert.lead.id,
            token: upsert.token,
          });
        } catch {
          await markLocalisationAuditLeadEmailFailed({
            leadId: upsert.lead.id,
            error: "localisation_audit_email_enqueue_failed",
          });
          return conflictResponse(
            c,
            "localisation_audit_email_enqueue_failed",
            "Could not queue the report email. Try again shortly.",
          );
        }

        return c.json({
          audit: {
            ...publicAuditView(audit),
            unlocked: publicReport,
            report: audit.report,
          },
          delivery: {
            status: "queued",
            message: "Check your inbox for a summary of this report.",
          },
        });
      }

      return c.json({
        audit: {
          ...publicAuditView(audit),
          unlocked: publicReport,
          report: publicReport ? audit.report : null,
        },
        delivery: {
          status: "pending",
          message: "We will email you a summary when the audit finishes.",
        },
      });
    })
    .get("/:domainSlug/verify", async (c) => {
      const domainSlug = c.req.param("domainSlug");
      if (!isValidDomainSlug(domainSlug)) {
        return badRequestResponse(c, "invalid_domain_slug", "Domain slug is invalid");
      }

      const token = c.req.query("token");
      const locale =
        normalizeAppLocale(c.req.query("locale") ?? DEFAULT_APP_LOCALE) ?? DEFAULT_APP_LOCALE;
      if (!token) {
        return badRequestResponse(c, "invalid_token", "A report token is required");
      }

      // Token stays valid until expiry so email link-previews cannot burn a one-click unlock.
      const verified = await verifyLocalisationAuditReportToken({ domainSlug, token });
      if (!verified) {
        return forbiddenResponse(
          c,
          "localisation_audit_token_invalid",
          "This report link is invalid or expired.",
        );
      }

      const cookieValue = signLocalisationAuditUnlock({
        domainSlug,
        email: verified.lead.email,
      });
      setCookie(c, localisationAuditUnlockCookieName(domainSlug), cookieValue, {
        httpOnly: true,
        sameSite: "Lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 180,
      });

      serverAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.emailVerified, {
        delivery: "verified",
        score_band: scoreBand(verified.audit.score),
      });

      return c.redirect(`/${locale}/localisation-audit/${domainSlug}`, 302);
    });
}
