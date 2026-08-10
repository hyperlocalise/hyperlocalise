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
import { and, inArray, isNull } from "drizzle-orm";
import { Resend } from "resend";

import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import type { IssueNotificationEmailEventData } from "@/lib/workflow/types";

function resendFromAddress(): string | null {
  if (!env.RESEND_FROM_ADDRESS) {
    return null;
  }
  return env.RESEND_FROM_NAME
    ? `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_ADDRESS}>`
    : env.RESEND_FROM_ADDRESS;
}

/**
 * Workflow step: send a pre-rendered Issue notification email via Resend,
 * then mark the related Inbox rows as emailed.
 */
export async function sendIssueNotificationEmailStep(event: IssueNotificationEmailEventData) {
  "use step";

  const from = resendFromAddress();
  if (!env.RESEND_API_KEY || !from) {
    throw new Error("Email delivery is not configured for this environment.");
  }

  if (event.notificationIds.length === 0) {
    return { ok: true as const, skipped: true as const, reason: "empty_notification_ids" };
  }

  // Drop anything already read or emailed before calling Resend.
  const openRows = await db
    .select({ id: schema.issueNotifications.id })
    .from(schema.issueNotifications)
    .where(
      and(
        inArray(schema.issueNotifications.id, event.notificationIds),
        isNull(schema.issueNotifications.readAt),
        isNull(schema.issueNotifications.emailedAt),
      ),
    );

  if (openRows.length === 0) {
    return { ok: true as const, skipped: true as const, reason: "already_read_or_emailed" };
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from,
    to: [event.to],
    subject: event.subject,
    html: event.html,
    text: event.text,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  const openIds = openRows.map((row) => row.id);
  await db
    .update(schema.issueNotifications)
    .set({ emailedAt: new Date() })
    .where(
      and(
        inArray(schema.issueNotifications.id, openIds),
        isNull(schema.issueNotifications.emailedAt),
        isNull(schema.issueNotifications.readAt),
      ),
    );

  return {
    ok: true as const,
    skipped: false as const,
    markedCount: openIds.length,
    resendId: result.data?.id ?? null,
  };
}
