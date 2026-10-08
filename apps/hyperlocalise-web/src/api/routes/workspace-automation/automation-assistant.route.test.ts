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
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { resolveApiAuthContextFromSessionMock, turnResponseMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  turnResponseMock: vi.fn(() => new Response("stream", { status: 200 })),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return { ...actual, resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock };
});

vi.mock("@/lib/billing/ai-features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/ai-features")>();
  return { ...actual, ensureAiFeaturesAllowed: vi.fn(async () => ({ ok: true, value: undefined })) };
});

vi.mock("@/lib/providers/organization-language-model", () => ({
  resolveHyperlocaliseAgentLanguageModel: vi.fn(async () => ({
    model: "openai/gpt-6-luna",
    source: "gateway",
    modelId: "openai/gpt-6-luna",
  })),
}));

vi.mock("@/agents/automation-assistant/agent/channels/web", () => ({
  createAutomationAssistantTurnResponse: turnResponseMock,
}));

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import type { AppType } from "@/api/typed-app";
import { buildWorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import { createDefaultWorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";
import { db, schema } from "@/lib/database/client";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

async function signIn(role: "admin" | "member" = "admin") {
  const identity = fixture.createWorkosIdentityWithRole(role);
  const headers = await fixture.authHeadersFor(identity);
  const [organization] = await db
    .select({ id: schema.organizations.id, slug: schema.organizations.slug })
    .from(schema.organizations)
    .where(eq(schema.organizations.workosOrganizationId, identity.organization.workosOrganizationId))
    .limit(1);
  return { identity, headers, organizationId: organization!.id, slug: organization!.slug };
}

async function seedAutomation(input: { organizationId: string; userId: string }) {
  const [automation] = await db
    .insert(schema.workspaceAutomations)
    .values({
      organizationId: input.organizationId,
      authorUserId: input.userId,
      name: "Weekly digest",
      instructions: "",
      triggerConfig: { mode: "manual" },
      toolConfig: {},
    })
    .returning({ id: schema.workspaceAutomations.id });
  return automation!.id;
}

const assistant = (slug: string) =>
  client.api.orgs[":organizationSlug"].automations.assistant;

function pageContext(automationId: string | null = null) {
  return buildWorkspaceAutomationEditorContext({
    editorSessionId: "editor-1",
    mode: automationId ? "detail" : "create",
    automationId,
    form: createDefaultWorkspaceAutomationFormState(),
    connections: { slack: true },
    timeZone: "Australia/Sydney",
    repositories: [],
    crowdinProjectIds: [],
    contentfulConnectionIds: [],
  });
}

describe("automation assistant sessions", () => {
  it("is for admins and localisation managers only", async () => {
    const { headers, slug } = await signIn("member");

    const response = await assistant(slug).sessions.$post(
      { param: { organizationSlug: slug }, json: {} },
      { headers },
    );

    expect(response.status).toBe(403);
  });

  it("makes a session that no conversation listing shows", async () => {
    const { headers, slug } = await signIn();

    const created = await assistant(slug).sessions.$post(
      { param: { organizationSlug: slug }, json: {} },
      { headers },
    );
    expect(created.status).toBe(201);
    const { session } = await created.json();
    expect(session).toMatchObject({ automationId: null, turnInProgress: false });

    const inboxItems = await db
      .select()
      .from(schema.inboxItems)
      .where(eq(schema.inboxItems.interactionId, session.id));
    expect(inboxItems).toEqual([]);

    const listed = await client.api.orgs[":organizationSlug"].conversations.$get(
      { param: { organizationSlug: slug }, query: {} },
      { headers },
    );
    expect(listed.status).toBe(200);
    const body = await listed.json();
    expect(body.conversations.map((conversation) => conversation.id)).not.toContain(session.id);

    const asConversation = await client.api.orgs[":organizationSlug"].conversations[
      ":conversationId"
    ].$get({ param: { organizationSlug: slug, conversationId: session.id } }, { headers });
    expect(asConversation.status).toBe(404);
  });

  it("resumes the author's own session for an automation once it is bound", async () => {
    const { headers, identity, organizationId, slug } = await signIn();
    const userId = await fixture.getLocalUserId(identity.user.workosUserId);
    const automationId = await seedAutomation({ organizationId, userId });

    const none = await assistant(slug).sessions.$get(
      { param: { organizationSlug: slug }, query: { automationId } },
      { headers },
    );
    expect(await none.json()).toEqual({ session: null, messages: [] });

    const created = await assistant(slug).sessions.$post(
      { param: { organizationSlug: slug }, json: {} },
      { headers },
    );
    const { session } = await created.json();
    const bound = await assistant(slug).sessions[":sessionId"].$patch(
      { param: { organizationSlug: slug, sessionId: session.id }, json: { automationId } },
      { headers },
    );
    expect(bound.status).toBe(200);

    const resumed = await assistant(slug).sessions.$get(
      { param: { organizationSlug: slug }, query: { automationId } },
      { headers },
    );
    expect(await resumed.json()).toMatchObject({ session: { id: session.id, automationId } });

    const colleague = fixture.createWorkosIdentityForOrganization(identity.organization, "admin");
    const colleagueHeaders = await fixture.authHeadersFor(colleague);
    const theirs = await assistant(slug).sessions.$get(
      { param: { organizationSlug: slug }, query: { automationId } },
      { headers: colleagueHeaders },
    );
    expect(await theirs.json()).toEqual({ session: null, messages: [] });
    const direct = await assistant(slug).sessions[":sessionId"].$get(
      { param: { organizationSlug: slug, sessionId: session.id } },
      { headers: colleagueHeaders },
    );
    expect(direct.status).toBe(404);
  });

  it("refuses a session for an automation the workspace does not have", async () => {
    const { headers, slug } = await signIn();

    const response = await assistant(slug).sessions.$post(
      { param: { organizationSlug: slug }, json: { automationId: crypto.randomUUID() } },
      { headers },
    );

    expect(response.status).toBe(404);
  });

  it("runs one turn at a time, with the page as it is", async () => {
    const { headers, slug } = await signIn();
    const created = await assistant(slug).sessions.$post(
      { param: { organizationSlug: slug }, json: {} },
      { headers },
    );
    const { session } = await created.json();
    const turns = assistant(slug).sessions[":sessionId"].turns;

    const badContext = await turns.$post(
      {
        param: { organizationSlug: slug, sessionId: session.id },
        json: { text: "Post a weekly summary", pageContext: { kind: "nope" } },
      },
      { headers },
    );
    expect(badContext.status).toBe(400);

    const started = await turns.$post(
      {
        param: { organizationSlug: slug, sessionId: session.id },
        json: { text: "Post a weekly summary", pageContext: pageContext() },
      },
      { headers },
    );
    expect(started.status).toBe(200);
    expect(turnResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ id: session.id }),
        text: "Post a weekly summary",
        pageContext: expect.objectContaining({ editorSessionId: "editor-1" }),
      }),
    );

    // The mocked turn never ends, so the claim stays and a second start is refused.
    const again = await turns.$post(
      {
        param: { organizationSlug: slug, sessionId: session.id },
        json: { text: "And email it", pageContext: pageContext() },
      },
      { headers },
    );
    expect(again.status).toBe(409);
    expect(turnResponseMock).toHaveBeenCalledTimes(1);
  });

  it("is deleted on start over", async () => {
    const { headers, slug } = await signIn();
    const created = await assistant(slug).sessions.$post(
      { param: { organizationSlug: slug }, json: {} },
      { headers },
    );
    const { session } = await created.json();

    const deleted = await assistant(slug).sessions[":sessionId"].$delete(
      { param: { organizationSlug: slug, sessionId: session.id } },
      { headers },
    );
    expect(deleted.status).toBe(204);

    const gone = await assistant(slug).sessions[":sessionId"].$get(
      { param: { organizationSlug: slug, sessionId: session.id } },
      { headers },
    );
    expect(gone.status).toBe(404);
  });
});
