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
import { userNotificationPreferencesService } from "@/lib/notifications/user-notification-preferences-service";
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

async function loadOpenNotificationIds(notificationIds: string[]): Promise<string[]> {
  const openRows = await db
    .select({ id: schema.issueNotifications.id })
    .from(schema.issueNotifications)
    .where(
      and(
        inArray(schema.issueNotifications.id, notificationIds),
        isNull(schema.issueNotifications.readAt),
        isNull(schema.issueNotifications.emailedAt),
      ),
    );
  return openRows.map((row) => row.id);
}

async function preferencesAllowDelivery(
  recipientUserId: string,
  emailFormat: IssueNotificationEmailEventData["emailFormat"],
): Promise<boolean> {
  const preferences = await userNotificationPreferencesService.getForUser(recipientUserId);
  return preferences.emailEnabled && preferences.emailFormat === emailFormat;
}

/**
 * Workflow step: send a pre-rendered Issue notification email via Resend,
 * then mark matching Inbox rows as emailed.
 *
 * `emailedAt` is set only after Resend succeeds so a crashed worker cannot
 * permanently suppress an undelivered notification. Concurrent retries share a
 * Resend idempotency key so duplicate API calls do not create duplicate mail.
 * Preferences are re-checked immediately before Resend so opt-out wins over a
 * stale queued payload.
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

  const openIds = await loadOpenNotificationIds(event.notificationIds);
  if (openIds.length === 0) {
    return { ok: true as const, skipped: true as const, reason: "already_read_or_emailed" };
  }

  // Recheck immediately before calling Resend so a mid-queue opt-out is honored.
  if (!(await preferencesAllowDelivery(event.recipientUserId, event.emailFormat))) {
    return { ok: true as const, skipped: true as const, reason: "delivery_preferences_changed" };
  }

  const resend = new Resend(env.RESEND_API_KEY);
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

  // Mark only rows that are still unread/unemailed. Do not claim before send —
  // an interrupted process must leave rows eligible for retry.
  const marked = await db
    .update(schema.issueNotifications)
    .set({ emailedAt: new Date() })
    .where(
      and(
        inArray(schema.issueNotifications.id, openIds),
        isNull(schema.issueNotifications.readAt),
        isNull(schema.issueNotifications.emailedAt),
      ),
    )
    .returning({ id: schema.issueNotifications.id });

  return {
    ok: true as const,
    skipped: false as const,
    markedCount: marked.length,
    resendId: result.data?.id ?? null,
  };
}
