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
import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const runDigestTickMock = vi.fn(async () => ({
  recipientsProcessed: 2,
  emailsEnqueued: 1,
  notificationsQueued: 3,
}));

async function createClient(input?: { cronSecret?: string | null }) {
  const cronSecret = input?.cronSecret === null ? undefined : (input?.cronSecret ?? "cron-secret");

  vi.resetModules();
  vi.doMock("@/lib/projects/issue-sheet/issue-notification-email-service", () => ({
    issueNotificationEmailService: {
      runDigestTick: runDigestTickMock,
    },
  }));
  vi.doMock("@/lib/env", () => ({
    env: {
      CRON_SECRET: cronSecret,
    },
  }));

  const { createIssueNotificationDigestRoutes } = await import("./issue-notification-digest.route");

  return testClient(createIssueNotificationDigestRoutes());
}

describe("issue notification digest cron route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/projects/issue-sheet/issue-notification-email-service");
    vi.doUnmock("@/lib/env");
    runDigestTickMock.mockClear();
  });

  it("rejects requests without the cron secret", async () => {
    const client = await createClient();
    const response = await client.index.$get();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("runs digest delivery when authorized", async () => {
    const client = await createClient();
    const response = await client.index.$get(
      {},
      {
        headers: {
          authorization: "Bearer cron-secret",
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: {
        recipientsProcessed: 2,
        emailsEnqueued: 1,
        notificationsQueued: 3,
      },
    });
    expect(runDigestTickMock).toHaveBeenCalledTimes(1);
  });
});
