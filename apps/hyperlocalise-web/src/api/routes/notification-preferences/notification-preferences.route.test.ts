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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { userNotificationPreferencesService } from "@/lib/notifications/user-notification-preferences-service";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  resolveApiAuthContextFromSessionMock.mockClear();
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

function prefsUrl(organizationSlug: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/notification-preferences`;
}

describe("notification preferences routes", () => {
  it("returns defaults when no preferences row exists", async () => {
    const { identity } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await app.request(prefsUrl(organizationSlug), { headers });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      preferences: {
        emailEnabled: false,
        emailFormat: "digest",
      },
    });
  });

  it("upserts preferences via PUT", async () => {
    const { identity } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const userId = await projectFixture.getLocalUserId(identity.user.workosUserId);

    const response = await app.request(prefsUrl(organizationSlug), {
      method: "PUT",
      headers: {
        ...Object.fromEntries(new Headers(headers).entries()),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ emailEnabled: true, emailFormat: "immediate" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      preferences: {
        emailEnabled: true,
        emailFormat: "immediate",
      },
    });

    await expect(userNotificationPreferencesService.getForUser(userId)).resolves.toEqual({
      emailEnabled: true,
      emailFormat: "immediate",
    });

    await db
      .delete(schema.userNotificationPreferences)
      .where(eq(schema.userNotificationPreferences.userId, userId));
  });
});
