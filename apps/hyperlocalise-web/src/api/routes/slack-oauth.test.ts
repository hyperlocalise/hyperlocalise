import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { createSlackState as createSignedSlackState } from "@/lib/agents/slack/oauth-state";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { createSlackOAuthRoutes } from "./slack-oauth";

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

const fixture = createProjectTestFixture();

async function createSlackState(slug: string) {
  return createSignedSlackState(slug, env.SLACK_OAUTH_STATE_SECRET ?? "");
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
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;
    if (!auth) {
      throw new Error("missing auth context");
    }

    const app = createSlackOAuthRoutes();
    const state = await createSlackState(organizationSlug);
    const response = await app.request(
      `http://localhost/callback?code=abc123&state=${encodeURIComponent(state)}`,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `/org/${organizationSlug}/agent?slack_connected=1`,
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
  });

  it("redirects when slack authorization is denied", async () => {
    const app = createSlackOAuthRoutes();
    const state = await createSlackState("acme");

    const response = await app.request(
      `http://localhost/callback?error=access_denied&state=${encodeURIComponent(state)}`,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard?error=access_denied");
    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(mocks.handleOAuthCallback).not.toHaveBeenCalled();
  });

  it("redirects when slack oauth callback handling fails", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    await fixture.authHeadersFor(identity);
    mocks.handleOAuthCallback.mockRejectedValueOnce(new Error("expired code"));

    const app = createSlackOAuthRoutes();
    const state = await createSlackState(organizationSlug);
    const response = await app.request(
      `http://localhost/callback?code=expired&state=${encodeURIComponent(state)}`,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard?error=slack_oauth_failed");
  });

  it("redirects when slack bot initialization fails", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    await fixture.authHeadersFor(identity);
    mocks.initialize.mockRejectedValueOnce(new Error("slack unavailable"));

    const app = createSlackOAuthRoutes();
    const state = await createSlackState(organizationSlug);
    const response = await app.request(
      `http://localhost/callback?code=abc123&state=${encodeURIComponent(state)}`,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard?error=slack_oauth_failed");
    expect(mocks.handleOAuthCallback).not.toHaveBeenCalled();
  });

  it("redirects when slack installation storage fails", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    await fixture.authHeadersFor(identity);
    const insertSpy = vi.spyOn(db, "insert").mockImplementationOnce(() => {
      throw new Error("db unavailable");
    });

    try {
      const app = createSlackOAuthRoutes();
      const state = await createSlackState(organizationSlug);
      const response = await app.request(
        `http://localhost/callback?code=abc123&state=${encodeURIComponent(state)}`,
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
});
