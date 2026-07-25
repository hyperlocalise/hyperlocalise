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
import { eq } from "drizzle-orm";
import { render } from "react-email";
import { Resend } from "resend";

import {
  LocalisationAuditReportEmail,
  localisationAuditReportEmailText,
} from "@/emails/localisation-audit-report-email";
import { LOCALISATION_AUDIT_ANALYTICS_EVENTS, scoreBand } from "@/lib/analytics";
import { serverAnalytics } from "@/lib/analytics/server";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import {
  buildLocalisationAuditVerifyUrl,
  hashLocalisationAuditReportToken,
  mintLocalisationAuditReportToken,
} from "@/lib/localisation-audit/email-unlock";
import {
  findLocalisationAuditById,
  findLocalisationAuditLeadById,
  markLocalisationAuditLeadEmailFailed,
  markLocalisationAuditLeadEmailSent,
} from "@/lib/localisation-audit/store";

export async function sendLocalisationAuditReportEmailStep(input: {
  leadId: string;
  token?: string;
}) {
  "use step";

  const lead = await findLocalisationAuditLeadById(input.leadId);
  if (!lead) {
    return { ok: false as const, code: "lead_not_found" as const };
  }
  if (lead.deliveryStatus === "verified") {
    return { ok: true as const, skipped: true as const, reason: "already_verified" as const };
  }

  const audit = await findLocalisationAuditById(lead.auditId);
  if (!audit || audit.status !== "succeeded" || !audit.report || audit.score == null) {
    await markLocalisationAuditLeadEmailFailed({
      leadId: input.leadId,
      error: "audit_not_ready",
    });
    return { ok: false as const, code: "audit_not_ready" as const };
  }

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_ADDRESS) {
    await markLocalisationAuditLeadEmailFailed({
      leadId: input.leadId,
      error: "resend_not_configured",
    });
    return { ok: false as const, code: "resend_not_configured" as const };
  }

  let token = input.token;
  const tokenMatches =
    token != null &&
    lead.tokenHash != null &&
    hashLocalisationAuditReportToken(token) === lead.tokenHash &&
    lead.tokenExpiresAt != null &&
    lead.tokenExpiresAt.getTime() > Date.now();

  if (!tokenMatches) {
    const minted = mintLocalisationAuditReportToken();
    token = minted.token;
    await db
      .update(schema.localisationAuditLeads)
      .set({
        tokenHash: minted.tokenHash,
        tokenExpiresAt: minted.expiresAt,
        deliveryStatus: "queued",
      })
      .where(eq(schema.localisationAuditLeads.id, input.leadId));
  }

  const verifyUrl = buildLocalisationAuditVerifyUrl({
    domainSlug: audit.domainSlug,
    token: token!,
    locale: lead.locale || "en",
  });

  const emailProps = {
    domainKey: audit.domainKey,
    score: audit.score,
    completedAt: audit.completedAt?.toISOString() ?? audit.report.completedAt,
    findings: audit.teaser?.headlineFindings ?? audit.report.findings.slice(0, 3),
    verifyUrl,
  };

  try {
    const html = await render(LocalisationAuditReportEmail(emailProps));
    const text = localisationAuditReportEmailText(emailProps);
    const resend = new Resend(env.RESEND_API_KEY);
    const fromName = env.RESEND_FROM_NAME ?? "Hyperlocalise";
    const result = await resend.emails.send({
      from: `${fromName} <${env.RESEND_FROM_ADDRESS}>`,
      to: lead.email,
      subject: `${audit.domainKey} localisation score: ${audit.score}/100`,
      html,
      text,
    });

    if (result.error) {
      await markLocalisationAuditLeadEmailFailed({
        leadId: input.leadId,
        error: result.error.message,
      });
      return { ok: false as const, code: "resend_error" as const };
    }

    await markLocalisationAuditLeadEmailSent(input.leadId);
    serverAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.reportEmailSent, {
      delivery: "sent",
      score_band: scoreBand(audit.score),
    });
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "email_send_failed";
    await markLocalisationAuditLeadEmailFailed({
      leadId: input.leadId,
      error: message,
    });
    return { ok: false as const, code: "email_send_failed" as const };
  }
}
