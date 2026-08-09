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

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import {
  createGitlabState as createSignedGitlabState,
  GITLAB_STATE_TTL_MS,
} from "@/lib/agents/gitlab/oauth-state";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { createGitlabOAuthRoutes } from "./gitlab-oauth.route";

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: vi.fn((options) => {
      if (globalThis.__resolveTestApiAuthContextFromSession) {
        return globalThis.__resolveTestApiAuthContextFromSession(options);
      }

      return globalThis.__testApiAuthContext ?? null;
    }),
  };
});

const fixture = createProjectTestFixture();

async function createCallbackState(options?: { consumed?: boolean; role?: "admin" | "member" }) {
  const identity = fixture.createWorkosIdentityWithRole(options?.role ?? "admin");
  const organizationSlug = identity.organization.slug ?? "missing-slug";
  const headers = await fixture.authHeadersFor(identity);
  const auth = globalThis.__testApiAuthContext;
  if (!auth) {
    throw new Error("missing auth context");
  }

  const nonce = randomUUID();
  const timestamp = Date.now();
  const state = await createSignedGitlabState(
    organizationSlug,
    env.GITLAB_OAUTH_STATE_SECRET ?? "",
    nonce,
    timestamp,
  );

  await db.insert(schema.gitlabConnectionStates).values({
    nonce,
    organizationId: auth.organization.localOrganizationId,
    userId: auth.user.localUserId,
    expiresAt: new Date(timestamp + GITLAB_STATE_TTL_MS),
    consumedAt: options?.consumed ? new Date() : null,
  });

  return { auth, headers, nonce, organizationSlug, state };
}

describe("gitlabOAuthRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("consumes oauth state before redirecting on provider error", async () => {
    const { headers, nonce, organizationSlug, state } = await createCallbackState({
      role: "admin",
    });
    const app = createGitlabOAuthRoutes();

    const first = await app.request(
      `http://localhost/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      { headers },
    );
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toBe(
      `/org/${organizationSlug}/integrations?error=gitlab_access_denied`,
    );

    const [stateRecord] = await db
      .select()
      .from(schema.gitlabConnectionStates)
      .where(eq(schema.gitlabConnectionStates.nonce, nonce))
      .limit(1);
    expect(stateRecord?.consumedAt).toBeInstanceOf(Date);

    const second = await app.request(
      `http://localhost/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      { headers },
    );
    expect(second.status).toBe(302);
    expect(second.headers.get("location")).toBe(
      `/org/${organizationSlug}/integrations?error=invalid_gitlab_state`,
    );
  });

  it("rejects already-consumed state on provider error replay", async () => {
    const { headers, organizationSlug, state } = await createCallbackState({
      role: "admin",
      consumed: true,
    });
    const app = createGitlabOAuthRoutes();

    const response = await app.request(
      `http://localhost/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      { headers },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `/org/${organizationSlug}/integrations?error=invalid_gitlab_state`,
    );
  });
});
