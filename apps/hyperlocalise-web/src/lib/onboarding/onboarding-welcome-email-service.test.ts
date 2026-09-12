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
import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { resendSend } = vi.hoisted(() => ({
  resendSend: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: (...args: unknown[]) => resendSend(...args),
    };
  },
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      RESEND_API_KEY: "test-resend-api-key",
      RESEND_FROM_ADDRESS: "hello@example.com",
      RESEND_FROM_NAME: "Hyperlocalise",
      HYPERLOCALISE_PUBLIC_APP_URL: "https://app.example.com",
    },
  };
});

import { db, schema } from "@/lib/database/client";

import { sendOnboardingWelcomeEmail } from "./onboarding-welcome-email-service";

describe("sendOnboardingWelcomeEmail", () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    for (const userId of createdUserIds.splice(0)) {
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });

  beforeEach(() => {
    resendSend.mockReset();
    resendSend.mockResolvedValue({ data: { id: "email_1" }, error: null });
  });

  async function insertUser(firstName = "Dev") {
    const [user] = await db
      .insert(schema.users)
      .values({
        workosUserId: `user_${crypto.randomUUID()}`,
        email: `new-${crypto.randomUUID()}@example.com`,
        firstName,
      })
      .returning({ id: schema.users.id, email: schema.users.email });

    createdUserIds.push(user.id);
    return user;
  }

  it("sends the welcome email once and claims the user", async () => {
    const user = await insertUser();

    const first = await sendOnboardingWelcomeEmail({
      userId: user.id,
      email: user.email,
      firstName: "Dev",
    });
    const second = await sendOnboardingWelcomeEmail({
      userId: user.id,
      email: user.email,
      firstName: "Dev",
    });

    expect(first).toEqual({ ok: true, skipped: false, resendId: "email_1" });
    expect(second).toEqual({ ok: true, skipped: true, reason: "already_sent" });
    expect(resendSend).toHaveBeenCalledTimes(1);

    const [sendArgs, sendOptions] = resendSend.mock.calls[0] as [
      {
        from: string;
        to: string[];
        subject: string;
        html: string;
        text: string;
      },
      { idempotencyKey: string },
    ];
    expect(sendArgs.from).toBe("Hyperlocalise <hello@example.com>");
    expect(sendArgs.to).toEqual([user.email]);
    expect(sendArgs.subject).toBe("Getting started with Hyperlocalise");
    expect(sendArgs.html).toContain("Hello Dev, and welcome to Hyperlocalise.");
    expect(sendArgs.html).toContain(
      "claude mcp add -t http hyperlocalise https://app.example.com/mcp",
    );
    expect(sendArgs.text).toContain("https://hyperlocalise.dev/platform/getting-started");
    expect(sendArgs.text).toContain("https://hyperlocalise.dev/cli/workflows/ci-automation");
    expect(sendArgs.html).toContain("Use the CLI in GitHub Actions");
    expect(sendArgs.html).toContain("hyperlocalise/hyperlocalise/install@v1");
    expect(sendOptions.idempotencyKey).toBe(`onboarding-welcome-email/${user.id}`);

    const [row] = await db
      .select({ sentAt: schema.users.onboardingEmailSentAt })
      .from(schema.users)
      .where(eq(schema.users.id, user.id));
    expect(row.sentAt).toBeInstanceOf(Date);
  });

  it("releases the claim when Resend fails", async () => {
    const user = await insertUser();
    resendSend.mockResolvedValue({ data: null, error: { message: "rate limited" } });

    await expect(
      sendOnboardingWelcomeEmail({
        userId: user.id,
        email: user.email,
        firstName: "Dev",
      }),
    ).rejects.toThrow("rate limited");

    const [row] = await db
      .select({ sentAt: schema.users.onboardingEmailSentAt })
      .from(schema.users)
      .where(eq(schema.users.id, user.id));
    expect(row.sentAt).toBeNull();
  });
});
