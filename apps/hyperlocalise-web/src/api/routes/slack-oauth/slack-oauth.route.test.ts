import "dotenv/config";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import {
  createSlackState as createSignedSlackState,
  SLACK_STATE_TTL_MS,
} from "@/lib/agents/slack/oauth-state";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { createSlackOAuthRoutes } from "./slack-oauth.route";

const mocks = vi.hoisted(() => ({
  getSlackBot: vi.fn(),
  initialize: vi.fn().mockResolvedValue(undefined),
  getAdapter: vi.fn(),
  handleOAuthCallback: vi.fn().mockResolvedValue({
    teamId: "T_INSTALLED",
    installation: {
      botToken: "xoxb-token",
      botUserId: "U_BOT",
      teamName: "Installed Workspace",
    },
  }),
}));

vi.mock("@/lib/agents/slack/bot", () => ({
  getSlackBot: mocks.getSlackBot.mockResolvedValue({
    initialize: mocks.initialize,
    getAdapter: mocks.getAdapter.mockReturnValue({
      handleOAuthCallback: mocks.handleOAuthCallback,
    }),
  }),
}));

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

async function createCallbackState(options?: {
  consumed?: boolean;
  dbExpired?: boolean;
  role?: "admin" | "member";
}) {
  const identity = fixture.createWorkosIdentityWithRole(options?.role ?? "admin");
  const organizationSlug = identity.organization.slug ?? "missing-slug";
  const headers = await fixture.authHeadersFor(identity);
  const auth = globalThis.__testApiAuthContext;
  if (!auth) {
    throw new Error("missing auth context");
  }

  const nonce = randomUUID();
  const timestamp = Date.now();
  const state = await createSignedSlackState(
    organizationSlug,
    env.SLACK_OAUTH_STATE_SECRET ?? "",
    nonce,
    timestamp,
  );

  await db.insert(schema.slackInstallationStates).values({
    nonce,
    organizationId: auth.organization.localOrganizationId,
    userId: auth.user.localUserId,
    expiresAt: new Date(timestamp + (options?.dbExpired ? -1 : SLACK_STATE_TTL_MS)),
    consumedAt: options?.consumed ? new Date() : null,
  });

  return { auth, headers, nonce, organizationSlug, state };
}

describe("slackOAuthRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("stores a slack installation against the organization from state", async () => {
    const { auth, headers, nonce, organizationSlug, state } = await createCallbackState({
      role: "admin",
    });

    const app = createSlackOAuthRoutes();
    const response = await app.request(
      `http://localhost/callback?code=abc123&state=${encodeURIComponent(state)}`,
      { headers },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `/org/${organizationSlug}/integrations?slack_connected=1`,
    );
    expect(mocks.initialize).toHaveBeenCalled();
    expect(mocks.handleOAuthCallback).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        redirectUri: "http://localhost/api/auth/slack/callback",
      }),
    );

    const [connector] = await db
      .select({
        organizationId: schema.connectors.organizationId,
        enabled: schema.connectors.enabled,
        config: schema.connectors.config,
      })
      .from(schema.connectors)
      .where(
        and(
          eq(schema.connectors.organizationId, auth.organization.localOrganizationId),
          eq(schema.connectors.kind, "slack"),
        ),
      )
      .limit(1);

    expect(connector).toEqual({
      organizationId: auth.organization.localOrganizationId,
      enabled: true,
      config: {
        teamId: "T_INSTALLED",
        teamName: "Installed Workspace",
        botUserId: "U_BOT",
      },
    });

    const [stateRecord] = await db
      .select()
      .from(schema.slackInstallationStates)
      .where(eq(schema.slackInstallationStates.nonce, nonce))
      .limit(1);
    expect(stateRecord?.consumedAt).toBeInstanceOf(Date);
  });

  it("redirects when slack authorization is denied", async () => {
    const { headers, state } = await createCallbackState({ role: "admin" });
    const app = createSlackOAuthRoutes();

    const response = await app.request(
      `http://localhost/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      { headers },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard?error=access_denied");
    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(mocks.handleOAuthCallback).not.toHaveBeenCalled();
  });

  it("redirects when slack oauth callback handling fails", async () => {
    const { headers, organizationSlug, state } = await createCallbackState({ role: "admin" });
    mocks.handleOAuthCallback.mockRejectedValueOnce(new Error("expired code"));

    const app = createSlackOAuthRoutes();
    const response = await app.request(
      `http://localhost/callback?code=expired&state=${encodeURIComponent(state)}`,
      { headers },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard?error=slack_oauth_failed");
    expect(organizationSlug).toBeTruthy();
  });

  it("redirects when slack bot initialization fails", async () => {
    const { headers, state } = await createCallbackState({ role: "admin" });
    mocks.initialize.mockRejectedValueOnce(new Error("slack unavailable"));

    const app = createSlackOAuthRoutes();
    const response = await app.request(
      `http://localhost/callback?code=abc123&state=${encodeURIComponent(state)}`,
      { headers },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard?error=slack_oauth_failed");
    expect(mocks.handleOAuthCallback).not.toHaveBeenCalled();
  });

  it("redirects when slack installation storage fails", async () => {
    const { headers, state } = await createCallbackState({ role: "admin" });
    const insertSpy = vi.spyOn(db, "insert").mockImplementationOnce(() => {
      throw new Error("db unavailable");
    });

    try {
      const app = createSlackOAuthRoutes();
      const response = await app.request(
        `http://localhost/callback?code=abc123&state=${encodeURIComponent(state)}`,
        { headers },
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/dashboard?error=slack_install_failed");
      expect(mocks.handleOAuthCallback).toHaveBeenCalled();
    } finally {
      insertSpy.mockRestore();
    }
  });

  it("rejects callbacks with invalid state", async () => {
    const app = createSlackOAuthRoutes();

    const response = await app.request("http://localhost/callback?code=abc123&state=bad");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard?error=invalid_slack_state");
    expect(mocks.handleOAuthCallback).not.toHaveBeenCalled();
  });

  it("rejects callbacks without an authenticated session", async () => {
    const { state } = await createCallbackState({ role: "admin" });
    globalThis.__testApiAuthContext = undefined;
    const app = createSlackOAuthRoutes();

    const response = await app.request(
      `http://localhost/callback?code=abc123&state=${encodeURIComponent(state)}`,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard?error=unauthorized");
    expect(mocks.handleOAuthCallback).not.toHaveBeenCalled();
  });

  it("rejects a non-admin member before consuming state", async () => {
    const { headers, nonce, state } = await createCallbackState({ role: "member" });
    const app = createSlackOAuthRoutes();

    const response = await app.request(
      `http://localhost/callback?code=abc123&state=${encodeURIComponent(state)}`,
      { headers },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard?error=forbidden");

    const [stateRecord] = await db
      .select()
      .from(schema.slackInstallationStates)
      .where(eq(schema.slackInstallationStates.nonce, nonce))
      .limit(1);
    expect(stateRecord?.consumedAt).toBeNull();
    expect(mocks.handleOAuthCallback).not.toHaveBeenCalled();
  });

  it("rejects a replayed state", async () => {
    const { headers, state } = await createCallbackState({ consumed: true, role: "admin" });
    const app = createSlackOAuthRoutes();

    const response = await app.request(
      `http://localhost/callback?code=abc123&state=${encodeURIComponent(state)}`,
      { headers },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard?error=invalid_slack_state");
    expect(mocks.handleOAuthCallback).not.toHaveBeenCalled();
  });

  it("rejects a state completed by a different authenticated user", async () => {
    const { headers, organizationSlug, state } = await createCallbackState({ role: "admin" });
    const organization = globalThis.__testApiAuthContext?.organization;
    const replayIdentity = fixture.createWorkosIdentityForOrganization(
      {
        workosOrganizationId: organization?.workosOrganizationId ?? "",
        name: organization?.name ?? "Example Org",
        slug: organizationSlug,
      },
      "admin",
    );
    const replayHeaders = await fixture.authHeadersFor(replayIdentity);
    const app = createSlackOAuthRoutes();

    const response = await app.request(
      `http://localhost/callback?code=abc123&state=${encodeURIComponent(state)}`,
      { headers: replayHeaders },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard?error=invalid_slack_state");
    expect(mocks.handleOAuthCallback).not.toHaveBeenCalled();
    expect(headers.cookie).not.toBe(replayHeaders.cookie);
  });
});
