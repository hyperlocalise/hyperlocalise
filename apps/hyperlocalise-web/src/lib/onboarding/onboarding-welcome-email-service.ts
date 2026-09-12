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
import { render } from "@react-email/render";
import { and, eq, isNull } from "drizzle-orm";
import { Resend } from "resend";

import {
  ONBOARDING_WELCOME_EMAIL_SUBJECT,
  OnboardingWelcomeEmail,
  onboardingWelcomeEmailText,
} from "@/emails/onboarding-welcome-email";
import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";
import { SITE_URL } from "@/lib/seo/site-url";

const GETTING_STARTED_URL = "https://hyperlocalise.dev/platform/getting-started";
const MCP_DOCS_URL = "https://hyperlocalise.dev/platform/mcp";

const logger = createLogger("onboarding-welcome-email");

export type OnboardingWelcomeEmailResult =
  | { ok: true; skipped: true; reason: "already_sent" | "resend_not_configured" }
  | { ok: true; skipped: false; resendId: string | null };

function publicAppOrigin(): string {
  return env.HYPERLOCALISE_PUBLIC_APP_URL ?? SITE_URL;
}

function resendFromAddress(): string | null {
  if (!env.RESEND_FROM_ADDRESS) {
    return null;
  }
  return env.RESEND_FROM_NAME
    ? `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_ADDRESS}>`
    : env.RESEND_FROM_ADDRESS;
}

async function claimOnboardingWelcomeEmail(
  database: DatabaseClient,
  userId: string,
): Promise<boolean> {
  const now = new Date();
  const [claimed] = await database
    .update(schema.users)
    .set({ onboardingEmailSentAt: now, updatedAt: now })
    .where(and(eq(schema.users.id, userId), isNull(schema.users.onboardingEmailSentAt)))
    .returning({ id: schema.users.id });

  return Boolean(claimed);
}

async function releaseOnboardingWelcomeEmailClaim(database: DatabaseClient, userId: string) {
  await database
    .update(schema.users)
    .set({ onboardingEmailSentAt: null, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

export async function sendOnboardingWelcomeEmail(input: {
  userId: string;
  email: string;
  firstName?: string | null;
  database?: DatabaseClient;
}): Promise<OnboardingWelcomeEmailResult> {
  const database = input.database ?? db;
  const from = resendFromAddress();

  if (!env.RESEND_API_KEY || !from) {
    logger.info("onboarding_welcome_email_skipped", {
      userId: input.userId,
      reason: "resend_not_configured",
    });
    return { ok: true, skipped: true, reason: "resend_not_configured" };
  }

  const claimed = await claimOnboardingWelcomeEmail(database, input.userId);
  if (!claimed) {
    return { ok: true, skipped: true, reason: "already_sent" };
  }

  const origin = publicAppOrigin();
  const mcpUrl = new URL("/mcp", origin).toString();
  const emailProps = {
    firstName: input.firstName,
    appUrl: origin,
    gettingStartedUrl: GETTING_STARTED_URL,
    mcpDocsUrl: MCP_DOCS_URL,
    mcpUrl,
    brandLogoUrl: `${origin}/images/logo.png`,
    claudeSnippet: `claude mcp add -t http hyperlocalise ${mcpUrl}`,
    codexSnippet: `codex mcp add hyperlocalise --url ${mcpUrl}`,
  };

  try {
    const html = await render(OnboardingWelcomeEmail(emailProps));
    const text = onboardingWelcomeEmailText(emailProps);
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send(
      {
        from,
        to: [input.email],
        subject: ONBOARDING_WELCOME_EMAIL_SUBJECT,
        html,
        text,
      },
      { idempotencyKey: `onboarding-welcome-email/${input.userId}` },
    );

    if (result.error) {
      throw new Error(result.error.message);
    }

    logger.info("onboarding_welcome_email_sent", {
      userId: input.userId,
    });

    return { ok: true, skipped: false, resendId: result.data?.id ?? null };
  } catch (error) {
    await releaseOnboardingWelcomeEmailClaim(database, input.userId);
    throw error;
  }
}
