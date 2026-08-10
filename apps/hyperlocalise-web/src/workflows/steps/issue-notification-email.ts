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
import { and, eq, inArray, isNull } from "drizzle-orm";
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

async function deliveryIdempotencyKey(notificationIds: string[]): Promise<string> {
  const input = new TextEncoder().encode(notificationIds.toSorted().join(","));
  const digest = await crypto.subtle.digest("SHA-256", input);
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `issue-notification-email/${hash}`;
}

/**
 * Workflow step: atomically claim Inbox rows, then send their pre-rendered
 * Issue notification email via Resend.
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

  const claimedAt = new Date();
  const openRows = await db
    .update(schema.issueNotifications)
    .set({ emailedAt: claimedAt })
    .where(
      and(
        inArray(schema.issueNotifications.id, event.notificationIds),
        isNull(schema.issueNotifications.readAt),
        isNull(schema.issueNotifications.emailedAt),
      ),
    )
    .returning({ id: schema.issueNotifications.id });

  if (openRows.length === 0) {
    return { ok: true as const, skipped: true as const, reason: "already_read_or_emailed" };
  }

  const openIds = openRows.map((row) => row.id);
  const resend = new Resend(env.RESEND_API_KEY);
  try {
    const idempotencyKey = await deliveryIdempotencyKey(openIds);
    const result = await resend.emails.send(
      {
        from,
        to: [event.to],
        subject: event.subject,
        html: event.html,
        text: event.text,
      },
      { idempotencyKey },
    );

    if (result.error) {
      throw new Error(result.error.message);
    }

    return {
      ok: true as const,
      skipped: false as const,
      markedCount: openIds.length,
      resendId: result.data?.id ?? null,
    };
  } catch (error) {
    await db
      .update(schema.issueNotifications)
      .set({ emailedAt: null })
      .where(
        and(
          inArray(schema.issueNotifications.id, openIds),
          eq(schema.issueNotifications.emailedAt, claimedAt),
        ),
      );
    throw error;
  }
}
