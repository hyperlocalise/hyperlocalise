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

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

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

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";

const app = createApp();
const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  resolveApiAuthContextFromSessionMock.mockClear();
  await fixture.cleanup();
});

function billingUrl(organizationSlug: string, path: string) {
  return `http://localhost/api/orgs/${organizationSlug}/billing/${path}`;
}

describe("billing routes", () => {
  it("returns local workspace resource usage for admins", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await app.request(
      billingUrl(identity.organization.slug ?? "missing-slug", "resource-usage"),
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resourceUsage: {
        seats: 1,
        projects: 0,
        automations: 0,
        integrations: 0,
      },
    });
  });

  it("forbids resource usage reads without billing access", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await app.request(
      billingUrl(identity.organization.slug ?? "missing-slug", "resource-usage"),
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "billing_read_forbidden" });
  });
});
