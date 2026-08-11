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
 * Workflow step: lock current preferences and Inbox rows while sending the
 * pre-rendered email. The transaction rolls back delivery state if interrupted.
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

  if (!event.recipientUserId || !event.emailFormat) {
    return { ok: true as const, skipped: true as const, reason: "missing_preference_context" };
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const idempotencyKey = await deliveryIdempotencyKey(event.notificationIds);

  return db.transaction(async (tx) => {
    const [preferences] = await tx
      .select({
        emailEnabled: schema.userNotificationPreferences.emailEnabled,
        emailFormat: schema.userNotificationPreferences.emailFormat,
      })
      .from(schema.userNotificationPreferences)
      .where(eq(schema.userNotificationPreferences.userId, event.recipientUserId))
      .limit(1)
      .for("update");
    if (!preferences?.emailEnabled || preferences.emailFormat !== event.emailFormat) {
      return { ok: true as const, skipped: true as const, reason: "delivery_preferences_changed" };
    }

    const notificationRows = await tx
      .select({
        id: schema.issueNotifications.id,
        recipientUserId: schema.issueNotifications.recipientUserId,
        readAt: schema.issueNotifications.readAt,
        emailedAt: schema.issueNotifications.emailedAt,
      })
      .from(schema.issueNotifications)
      .where(inArray(schema.issueNotifications.id, event.notificationIds))
      .for("update");
    const openRows = notificationRows.filter(
      (row) =>
        row.recipientUserId === event.recipientUserId &&
        row.readAt == null &&
        row.emailedAt == null,
    );

    if (openRows.length === 0) {
      return { ok: true as const, skipped: true as const, reason: "already_read_or_emailed" };
    }
    if (
      notificationRows.length !== event.notificationIds.length ||
      openRows.length !== notificationRows.length
    ) {
      return { ok: true as const, skipped: true as const, reason: "partially_unavailable" };
    }

    const openIds = openRows.map((row) => row.id);
    await tx
      .update(schema.issueNotifications)
      .set({ emailedAt: new Date() })
      .where(
        and(
          inArray(schema.issueNotifications.id, openIds),
          isNull(schema.issueNotifications.readAt),
          isNull(schema.issueNotifications.emailedAt),
        ),
      );

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
  });
}
