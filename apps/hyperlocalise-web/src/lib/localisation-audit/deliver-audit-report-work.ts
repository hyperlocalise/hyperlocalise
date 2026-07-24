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
import { Resend } from "resend";

import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import type { LocalisationAuditError } from "./types";

export type DeliverAuditReportInput = {
  leadId: string;
  accessUrl: string;
};

export type DeliverAuditReportResult = {
  leadId: string;
  deliveryStatus: "sent" | "skipped" | "failed";
};

async function sendReportEmailBestEffort(input: {
  email: string;
  accessUrl: string;
}): Promise<"sent" | "skipped" | "failed"> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_ADDRESS;
  if (!apiKey || !fromAddress) {
    return "skipped";
  }

  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send({
      from: `${env.RESEND_FROM_NAME ?? "Hyperlocalise"} <${fromAddress}>`,
      to: input.email,
      subject: "Your localisation health audit",
      text: `Your private localisation audit is ready: ${input.accessUrl}`,
    });
    return response.error ? "failed" : "sent";
  } catch {
    return "failed";
  }
}

export async function deliverAuditReportWork(
  input: DeliverAuditReportInput,
): Promise<Result<DeliverAuditReportResult, LocalisationAuditError>> {
  const [lead] = await db
    .select({
      id: schema.localisationAuditLeads.id,
      auditId: schema.localisationAuditLeads.auditId,
      email: schema.localisationAuditLeads.email,
      emailDeliveryStatus: schema.localisationAuditLeads.emailDeliveryStatus,
    })
    .from(schema.localisationAuditLeads)
    .where(eq(schema.localisationAuditLeads.id, input.leadId))
    .limit(1);
  if (!lead) {
    return err({ code: "report_not_found", message: "The report lead was not found." });
  }
  if (lead.emailDeliveryStatus === "sent" || lead.emailDeliveryStatus === "skipped") {
    return ok({
      leadId: lead.id,
      deliveryStatus: lead.emailDeliveryStatus,
    });
  }

  const deliveryStatus = await sendReportEmailBestEffort({
    email: lead.email,
    accessUrl: input.accessUrl,
  });
  await db
    .update(schema.localisationAuditLeads)
    .set({ emailDeliveryStatus: deliveryStatus })
    .where(eq(schema.localisationAuditLeads.id, lead.id));

  if (deliveryStatus === "failed") {
    await db.insert(schema.localisationAuditEvents).values({
      auditId: lead.auditId,
      leadId: lead.id,
      eventType: "email_delivery_failed",
      metadata: { deliveryStatus },
    });
    return err({
      code: "audit_email_delivery_failed",
      message: "The report email could not be delivered. Try again.",
    });
  }

  return ok({ leadId: lead.id, deliveryStatus });
}
