import "dotenv/config";

import { createHmac } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { createSlackWebhookRoutes } from "./slack-webhook.route";

const fixture = createProjectTestFixture();

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  slackWebhook: vi.fn().mockResolvedValue(Response.json({ status: "ok" })),
}));

vi.mock("next/server", () => ({
  after: mocks.after,
}));

vi.mock("@/lib/agents/slack/bot", () => {
  return {
    getSlackBot: vi.fn().mockResolvedValue({
      webhooks: {
        slack: mocks.slackWebhook,
      },
    }),
  };
});

function signSlackPayload(body: string): Record<string, string> {
  const secret = env.SLACK_SIGNING_SECRET ?? "test-slack-signing-secret";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const baseString = `v0:${timestamp}:${body}`;
  const signature = `v0=${createHmac("sha256", secret).update(baseString).digest("hex")}`;

  return {
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": signature,
  };
}

async function createStoredSlackConnector(input: {
  organizationId: string;
  enabled: boolean;
  teamId: string;
}) {
  const [connector] = await db
    .insert(schema.connectors)
    .values({
      organizationId: input.organizationId,
      kind: "slack",
      enabled: input.enabled,
      config: { teamId: input.teamId },
    })
    .onConflictDoUpdate({
      target: [schema.connectors.organizationId, schema.connectors.kind],
      set: {
        enabled: input.enabled,
        config: { teamId: input.teamId },
        updatedAt: new Date(),
      },
    })
    .returning();

  return connector;
}

describe("slackWebhookRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("responds to slack url verification challenge", async () => {
    const app = createSlackWebhookRoutes();
    const body = JSON.stringify({ challenge: "abc123" });
    const headers = signSlackPayload(body);

    const response = await app.request("http://localhost/", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ challenge: "abc123" });
    expect(mocks.slackWebhook).not.toHaveBeenCalled();
  });

  it("rejects requests with invalid signature", async () => {
    const app = createSlackWebhookRoutes();
    const body = JSON.stringify({ event: { team_id: "T123" } });

    const response = await app.request("http://localhost/", {
      method: "POST",
      headers: { "content-type": "application/json", "x-slack-signature": "bad" },
      body,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_signature" });
    expect(mocks.slackWebhook).not.toHaveBeenCalled();
  });

  it("ignores webhooks from unknown workspaces", async () => {
    const app = createSlackWebhookRoutes();
    const body = JSON.stringify({ event: { type: "app_mention", team_id: "T_UNKNOWN" } });
    const headers = signSlackPayload(body);

    const response = await app.request("http://localhost/", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true });
    expect(mocks.slackWebhook).not.toHaveBeenCalled();
  });

  it("ignores webhooks from disabled workspaces", async () => {
    const identity = fixture.createWorkosIdentity();
    await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;
    if (!auth) {
      throw new Error("missing auth context");
    }

    await createStoredSlackConnector({
      organizationId: auth.organization.localOrganizationId,
      enabled: false,
      teamId: "T_DISABLED",
    });

    const app = createSlackWebhookRoutes();
    const body = JSON.stringify({ event: { type: "app_mention", team_id: "T_DISABLED" } });
    const headers = signSlackPayload(body);

    const response = await app.request("http://localhost/", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true });
    expect(mocks.slackWebhook).not.toHaveBeenCalled();
  });

  it("delegates enabled workspace webhooks to the slack bot adapter", async () => {
    const identity = fixture.createWorkosIdentity();
    await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;
    if (!auth) {
      throw new Error("missing auth context");
    }

    await createStoredSlackConnector({
      organizationId: auth.organization.localOrganizationId,
      enabled: true,
      teamId: "T_ENABLED",
    });

    const app = createSlackWebhookRoutes();
    const body = JSON.stringify({ event: { type: "app_mention", team_id: "T_ENABLED" } });
    const headers = signSlackPayload(body);

    const response = await app.request("http://localhost/", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(mocks.slackWebhook).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        waitUntil: expect.any(Function),
      }),
    );
  });

  it("registers slack message processing with Next after", async () => {
    const identity = fixture.createWorkosIdentity();
    await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;
    if (!auth) {
      throw new Error("missing auth context");
    }

    await createStoredSlackConnector({
      organizationId: auth.organization.localOrganizationId,
      enabled: true,
      teamId: "T_AFTER",
    });

    const app = createSlackWebhookRoutes();
    const body = JSON.stringify({ event: { type: "app_mention", team_id: "T_AFTER" } });
    const headers = signSlackPayload(body);
    const task = Promise.resolve();

    await app.request("http://localhost/", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });

    const options = mocks.slackWebhook.mock.calls.at(-1)?.[1];
    options.waitUntil(task);

    expect(mocks.after).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.after.mock.calls.at(-1)?.[0]()).toBe(task);
  });
});
