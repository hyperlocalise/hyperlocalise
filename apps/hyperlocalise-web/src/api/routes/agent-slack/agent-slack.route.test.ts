import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { verifySlackState } from "@/lib/agents/slack/oauth-state";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";

const mocks = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  getSlackBotMock: vi.fn(),
  initializeMock: vi.fn().mockResolvedValue(undefined),
  getAdapterMock: vi.fn(),
  getInstallationMock: vi.fn().mockResolvedValue({ botToken: "xoxb-token" }),
  fetchMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/log", () => ({
  createLogger: vi.fn(() => ({
    error: mocks.loggerErrorMock,
  })),
  serializeErrorForLog: (error: unknown) => error,
}));

vi.mock("@/lib/agents/slack/bot", () => ({
  getSlackBot: mocks.getSlackBotMock.mockResolvedValue({
    initialize: mocks.initializeMock,
    getAdapter: mocks.getAdapterMock.mockReturnValue({
      getInstallation: mocks.getInstallationMock,
    }),
  }),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

const client = testClient(app);
const fixture = createProjectTestFixture(client);

async function createStoredSlackConnector(input: {
  organizationId: string;
  enabled: boolean;
  teamId?: string;
  teamName?: string;
}) {
  const [connector] = await db
    .insert(schema.connectors)
    .values({
      organizationId: input.organizationId,
      kind: "slack",
      enabled: input.enabled,
      config: { teamId: input.teamId, teamName: input.teamName },
    })
    .onConflictDoUpdate({
      target: [schema.connectors.organizationId, schema.connectors.kind],
      set: {
        enabled: input.enabled,
        config: { teamId: input.teamId, teamName: input.teamName },
        updatedAt: new Date(),
      },
    })
    .returning();

  return connector;
}

function restoreDefaultMocks() {
  mocks.resolveApiAuthContextFromSessionMock.mockImplementation(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  );
  mocks.initializeMock.mockResolvedValue(undefined);
  mocks.getInstallationMock.mockResolvedValue({ botToken: "xoxb-token" });
  mocks.getAdapterMock.mockReturnValue({
    getInstallation: mocks.getInstallationMock,
  });
  mocks.getSlackBotMock.mockResolvedValue({
    initialize: mocks.initializeMock,
    getAdapter: mocks.getAdapterMock,
  });
}

async function setupEnabledSlackConnector() {
  const identity = fixture.createWorkosIdentityWithRole("admin");
  const organizationSlug = identity.organization.slug ?? "missing-slug";
  const headers = await fixture.authHeadersFor(identity);
  const auth = globalThis.__testApiAuthContext;
  if (!auth) {
    throw new Error("missing auth context");
  }

  await createStoredSlackConnector({
    organizationId: auth.organization.localOrganizationId,
    enabled: true,
    teamId: "T123",
    teamName: "My Team",
  });

  return { organizationSlug, headers, auth };
}

describe("agentSlackRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    restoreDefaultMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(mocks.fetchMock);
  });

  afterEach(async () => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    await fixture.cleanup();
  });

  it("returns slack agent status when no connector exists", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["agent-slack"].$get(
      {
        param: { organizationSlug },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      slackAgent: {
        enabled: false,
        teamId: null,
        teamName: null,
      },
    });
  });

  it("returns slack agent status for an existing connector", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const headers = await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;
    if (!auth) {
      throw new Error("missing auth context");
    }

    await createStoredSlackConnector({
      organizationId: auth.organization.localOrganizationId,
      enabled: true,
      teamId: "T123",
      teamName: "My Team",
    });

    const response = await client.api.orgs[":organizationSlug"]["agent-slack"].$get(
      {
        param: { organizationSlug },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      slackAgent: {
        enabled: true,
        teamId: "T123",
        teamName: "My Team",
      },
    });
  });

  it("lists Slack channels for an enabled connector", async () => {
    const { organizationSlug, headers } = await setupEnabledSlackConnector();

    mocks.fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        channels: [
          { id: "C_PRIVATE", name: "team-l10n", is_private: true },
          { id: "C_PUBLIC", name: "localization", is_private: false },
          { id: "C_ARCHIVED", name: "old", is_archived: true },
        ],
        response_metadata: {},
      }),
    } as unknown as Response);

    const response = await client.api.orgs[":organizationSlug"]["agent-slack"].channels.$get(
      {
        param: { organizationSlug },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      channels: [
        { id: "slack:C_PUBLIC", name: "localization", private: false },
        { id: "slack:C_PRIVATE", name: "team-l10n", private: true },
      ],
    });
    expect(mocks.getInstallationMock).toHaveBeenCalledWith("T123");
    expect(mocks.fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining("https://slack.com/api/conversations.list"),
      }),
      expect.objectContaining({
        headers: { authorization: "Bearer xoxb-token" },
      }),
    );
  });

  it("returns 404 when the Slack installation is missing", async () => {
    const { organizationSlug, headers } = await setupEnabledSlackConnector();
    mocks.getInstallationMock.mockResolvedValue(null);

    const response = await client.api.orgs[":organizationSlug"]["agent-slack"].channels.$get(
      {
        param: { organizationSlug },
      },
      { headers },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "slack_installation_not_found" });
    expect(mocks.loggerErrorMock).not.toHaveBeenCalled();
  });

  it("returns 502 when Slack responds with a non-2xx status", async () => {
    const { organizationSlug, headers, auth } = await setupEnabledSlackConnector();
    mocks.fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    const response = await client.api.orgs[":organizationSlug"]["agent-slack"].channels.$get(
      {
        param: { organizationSlug },
      },
      { headers },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "slack_channels_unavailable" });
    expect(mocks.loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "slack_http_error",
        status: 503,
        organizationId: auth.organization.localOrganizationId,
        teamId: "T123",
      }),
      "slack channel list failed",
    );
  });

  it("returns 502 when Slack returns an API error", async () => {
    const { organizationSlug, headers, auth } = await setupEnabledSlackConnector();
    mocks.fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: false, error: "invalid_auth" }),
    } as unknown as Response);

    const response = await client.api.orgs[":organizationSlug"]["agent-slack"].channels.$get(
      {
        param: { organizationSlug },
      },
      { headers },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "slack_channels_unavailable" });
    expect(mocks.loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "slack_api_error",
        slackError: "invalid_auth",
        organizationId: auth.organization.localOrganizationId,
        teamId: "T123",
      }),
      "slack channel list failed",
    );
  });

  it("returns 502 when the Slack bot is unavailable", async () => {
    const { organizationSlug, headers, auth } = await setupEnabledSlackConnector();
    mocks.fetchMock.mockRejectedValue(new Error("network unavailable"));

    const response = await client.api.orgs[":organizationSlug"]["agent-slack"].channels.$get(
      {
        param: { organizationSlug },
      },
      { headers },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "slack_channels_unavailable" });
    expect(mocks.loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "bot_unavailable",
        err: expect.any(Error),
        organizationId: auth.organization.localOrganizationId,
        teamId: "T123",
      }),
      "slack channel list failed",
    );
  });

  it("returns an empty channel list when Slack is disconnected", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["agent-slack"].channels.$get(
      {
        param: { organizationSlug },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ channels: [] });
  });

  it("returns an org-scoped slack install url for admins", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["agent-slack"]["install-url"].$get(
      {
        param: { organizationSlug },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    if (!("url" in body)) {
      throw new Error("Expected slack install url response");
    }
    const url = new URL(body.url);
    const state = url.searchParams.get("state");

    expect(url.origin).toBe("https://slack.com");
    expect(url.pathname).toBe("/oauth/v2/authorize");
    expect(url.searchParams.get("client_id")).toBe(env.SLACK_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost/api/auth/slack/callback");
    expect(url.searchParams.get("scope")).toContain("app_mentions:read");
    expect(url.searchParams.get("scope")).toContain("files:read");
    expect(url.searchParams.get("scope")).toContain("files:write");
    expect(state).toBeTruthy();
    const verified = await verifySlackState(state ?? "", env.SLACK_OAUTH_STATE_SECRET ?? "");
    expect(verified).toMatchObject({ slug: organizationSlug });

    const auth = globalThis.__testApiAuthContext;
    if (!auth) {
      throw new Error("missing auth context");
    }

    const states = await db
      .select()
      .from(schema.slackInstallationStates)
      .where(
        eq(schema.slackInstallationStates.organizationId, auth.organization.localOrganizationId),
      );
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      nonce: verified?.nonce,
      userId: auth.user.localUserId,
      consumedAt: null,
    });
  });

  it("rejects slack install url requests when the organization has no slug", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const identityWithoutSlug = {
      ...identity,
      organization: {
        ...identity.organization,
        slug: undefined,
      },
    };

    const response = await client.api.orgs[":organizationSlug"]["agent-slack"]["install-url"].$get(
      {
        param: { organizationSlug: "missing-slug" },
      },
      {
        headers: await fixture.authHeadersFor(identityWithoutSlug),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "organization_slug_required" });
  });

  it("rejects slack install url requests from non-admin members", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["agent-slack"]["install-url"].$get(
      {
        param: { organizationSlug },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("enables the slack agent", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["agent-slack"].$patch(
      {
        param: { organizationSlug },
        json: { enabled: true },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    if (!("slackAgent" in body)) {
      throw new Error("Expected slack agent response");
    }
    expect(body.slackAgent.enabled).toBe(true);

    const authContext = globalThis.__testApiAuthContext;
    const [connector] = await db
      .select({ enabled: schema.connectors.enabled, config: schema.connectors.config })
      .from(schema.connectors)
      .where(
        and(
          eq(schema.connectors.organizationId, authContext?.organization.localOrganizationId ?? ""),
          eq(schema.connectors.kind, "slack"),
        ),
      )
      .limit(1);

    expect(connector?.enabled).toBe(true);
  });

  it("disables the slack agent", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const headers = await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;
    if (!auth) {
      throw new Error("missing auth context");
    }

    await createStoredSlackConnector({
      organizationId: auth.organization.localOrganizationId,
      enabled: true,
    });

    const response = await client.api.orgs[":organizationSlug"]["agent-slack"].$patch(
      {
        param: { organizationSlug },
        json: { enabled: false },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    if (!("slackAgent" in body)) {
      throw new Error("Expected slack agent response");
    }
    expect(body.slackAgent.enabled).toBe(false);
  });

  it("rejects enable from non-admin members", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["agent-slack"].$patch(
      {
        param: { organizationSlug },
        json: { enabled: true },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("rejects invalid payload", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["agent-slack"].$patch(
      {
        param: { organizationSlug },
        json: { enabled: "yes" } as unknown as { enabled: boolean },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_slack_agent_payload" });
  });
});
