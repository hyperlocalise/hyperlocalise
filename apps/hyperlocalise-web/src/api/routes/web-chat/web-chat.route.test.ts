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

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  checkBotIdMock,
  resolveApiAuthContextFromSessionMock,
  createWebChatAgentUIStreamResponseMock,
  ensureAiFeaturesAllowedMock,
} = vi.hoisted(() => ({
  checkBotIdMock: vi.fn(),
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  createWebChatAgentUIStreamResponseMock: vi.fn(() => new Response("ok", { status: 200 })),
  ensureAiFeaturesAllowedMock: vi.fn(),
}));

vi.mock("botid/server", () => ({
  checkBotId: checkBotIdMock,
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/agents/automations/workspace/agent/channels/web-chat", () => ({
  createWebChatAgentUIStreamResponse: createWebChatAgentUIStreamResponseMock,
}));

vi.mock("@/lib/billing/ai-features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/ai-features")>();
  return {
    ...actual,
    ensureAiFeaturesAllowed: ensureAiFeaturesAllowedMock,
  };
});

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { addInteractionMessage } from "@/lib/conversations/interactions";
import { db, schema } from "@/lib/database/client";
import {
  WEB_CHAT_HISTORY_LIMIT,
  WEB_CHAT_MAX_IMAGE_BYTES,
  WEB_CHAT_MAX_IMAGE_FILES,
  WEB_CHAT_MAX_IMAGE_REQUEST_BYTES,
  listRecentWebChatMessages,
} from "@/lib/agents/workspace-automation-web-chat";
import { err, ok } from "@/lib/primitives/result/results";
import { AI_FEATURES_REQUIRED_CODE, AI_FEATURES_REQUIRED_MESSAGE } from "@/lib/billing/ai-features";
import { createMemoryFileStorageAdapter } from "../file/file.fixture";

const fileStorageAdapter = createMemoryFileStorageAdapter();
const app = createApp({ fileStorageAdapter });
const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  checkBotIdMock.mockResolvedValue({ isBot: false });
  createWebChatAgentUIStreamResponseMock.mockReturnValue(new Response("ok", { status: 200 }));
  ensureAiFeaturesAllowedMock.mockResolvedValue(ok(undefined));
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

async function createWebChatAutomation(input: {
  organizationSlug: string;
  headers: { cookie: string };
}) {
  const createdResponse = await app.request(`/api/orgs/${input.organizationSlug}/automations`, {
    method: "POST",
    headers: {
      cookie: input.headers.cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Docs assistant",
      instructions: "Help visitors with product questions.",
      triggerConfig: { mode: "web_chat" },
      repositoryTarget: { kind: "none" },
      toolConfig: { knowledgeFiles: { enabled: true } },
    }),
  });
  expect(createdResponse.status).toBe(201);
  const body = (await createdResponse.json()) as { automation: { id: string; name: string } };
  return body.automation;
}

async function postVisitorMessage(input: {
  organizationSlug: string;
  automationId: string;
  text: string;
  cookie?: string;
}) {
  const formData = new FormData();
  formData.set("text", input.text);
  const response = await app.request(
    `/api/public/web-chat/${input.organizationSlug}/${input.automationId}/messages`,
    {
      method: "POST",
      headers: input.cookie ? { cookie: input.cookie } : undefined,
      body: formData,
    },
  );
  const body = (await response.json()) as {
    conversation: { id: string };
    message: { id: string; text: string };
    error?: string;
  };
  return {
    response,
    body,
    cookie: response.headers.get("set-cookie") ?? input.cookie ?? "",
  };
}

function chatRequestBody(messageId: string) {
  return JSON.stringify({
    messages: [{ id: messageId, role: "user", parts: [{ type: "text", text: "hello" }] }],
  });
}

describe("public web chat routes", () => {
  it("rejects visitor messages when AI features are not allowed", async () => {
    ensureAiFeaturesAllowedMock.mockResolvedValue(
      err({
        code: AI_FEATURES_REQUIRED_CODE,
        message: AI_FEATURES_REQUIRED_MESSAGE,
      }),
    );
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const automation = await createWebChatAutomation({ organizationSlug, headers });

    const created = await postVisitorMessage({
      organizationSlug,
      automationId: automation.id,
      text: "Hello from a free plan visitor",
    });

    expect(created.response.status).toBe(403);
    expect(created.body).toMatchObject({
      error: AI_FEATURES_REQUIRED_CODE,
      message: AI_FEATURES_REQUIRED_MESSAGE,
    });
    expect(ensureAiFeaturesAllowedMock).toHaveBeenCalled();
    expect(createWebChatAgentUIStreamResponseMock).not.toHaveBeenCalled();
  });

  it("rejects conversation chat streams when AI features are not allowed", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const automation = await createWebChatAutomation({ organizationSlug, headers });

    const created = await postVisitorMessage({
      organizationSlug,
      automationId: automation.id,
      text: "Seed message before denial",
    });
    expect(created.response.status).toBe(201);

    ensureAiFeaturesAllowedMock.mockResolvedValue(
      err({
        code: AI_FEATURES_REQUIRED_CODE,
        message: AI_FEATURES_REQUIRED_MESSAGE,
      }),
    );

    const response = await app.request(
      `/api/public/web-chat/${organizationSlug}/${automation.id}/conversations/${created.body.conversation.id}/chat`,
      {
        method: "POST",
        headers: {
          cookie: created.cookie,
          "Content-Type": "application/json",
        },
        body: chatRequestBody(created.body.message.id),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: AI_FEATURES_REQUIRED_CODE,
      message: AI_FEATURES_REQUIRED_MESSAGE,
    });
    expect(createWebChatAgentUIStreamResponseMock).not.toHaveBeenCalled();
  });

  it("returns public agent metadata without auth", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const automation = await createWebChatAutomation({ organizationSlug, headers });

    const response = await app.request(`/api/public/web-chat/${organizationSlug}/${automation.id}`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      agent: {
        id: automation.id,
        name: "Docs assistant",
        status: "active",
      },
    });
  });

  it("creates a visitor message with an image and stores the conversation", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const automation = await createWebChatAutomation({ organizationSlug, headers });

    const formData = new FormData();
    formData.set("text", "What does this screenshot show?");
    formData.append(
      "files",
      new File([Uint8Array.from([137, 80, 78, 71])], "screen.png", { type: "image/png" }),
    );

    const response = await app.request(
      `/api/public/web-chat/${organizationSlug}/${automation.id}/messages`,
      {
        method: "POST",
        body: formData,
      },
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      conversation: { id: string };
      message: {
        text: string;
        attachments: Array<{ filename: string; contentType: string; url: string }>;
      };
    };
    expect(body.message.text).toBe("What does this screenshot show?");
    expect(body.message.attachments).toEqual([
      expect.objectContaining({
        filename: "screen.png",
        contentType: "image/png",
      }),
    ]);

    const visitorCookie = response.headers.get("set-cookie") ?? "";
    const fileResponse = await app.request(body.message.attachments[0].url, {
      headers: { cookie: visitorCookie },
    });
    expect(fileResponse.status).toBe(200);
    expect(fileResponse.headers.get("content-type")).toBe("image/png");

    const conversationResponse = await app.request(
      `/api/public/web-chat/${organizationSlug}/${automation.id}/conversation`,
      {
        headers: {
          cookie: visitorCookie,
        },
      },
    );
    expect(conversationResponse.status).toBe(200);
    await expect(conversationResponse.json()).resolves.toMatchObject({
      conversation: { id: body.conversation.id },
      messages: [{ id: expect.any(String), text: "What does this screenshot show?" }],
    });
  });

  it("rejects bot traffic on message create", async () => {
    checkBotIdMock.mockResolvedValue({ isBot: true });
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const automation = await createWebChatAutomation({ organizationSlug, headers });

    const formData = new FormData();
    formData.set("text", "hello from a bot");

    const response = await app.request(
      `/api/public/web-chat/${organizationSlug}/${automation.id}/messages`,
      {
        method: "POST",
        body: formData,
      },
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "bot_detected",
    });
  });

  it("hides automations that are not web chat", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createdResponse = await app.request(`/api/orgs/${organizationSlug}/automations`, {
      method: "POST",
      headers: {
        cookie: headers.cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Nightly check",
        instructions: "Run checks.",
        triggerConfig: { mode: "manual" },
        repositoryTarget: { kind: "none" },
        toolConfig: {},
      }),
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as { automation: { id: string } };

    const response = await app.request(
      `/api/public/web-chat/${organizationSlug}/${created.automation.id}`,
    );
    expect(response.status).toBe(404);
  });

  it("keeps the newest history window in chronological order", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const automation = await createWebChatAutomation({ organizationSlug, headers });
    const created = await postVisitorMessage({
      organizationSlug,
      automationId: automation.id,
      text: "seed",
    });
    expect(created.response.status).toBe(201);

    const startedAt = Date.now();
    const extraCount = WEB_CHAT_HISTORY_LIMIT + 4;
    await db.insert(schema.interactionMessages).values(
      Array.from({ length: extraCount }, (_, index) => ({
        interactionId: created.body.conversation.id,
        senderType: "user" as const,
        text: `msg-${index}`,
        createdAt: new Date(startedAt + index + 1),
      })),
    );

    const history = await listRecentWebChatMessages(created.body.conversation.id);
    expect(history).toHaveLength(WEB_CHAT_HISTORY_LIMIT);
    expect(history[0]?.text).toBe(`msg-${extraCount - WEB_CHAT_HISTORY_LIMIT}`);
    expect(history.at(-1)?.text).toBe(`msg-${extraCount - 1}`);
    expect(history.some((message) => message.text === "seed")).toBe(false);
  });

  it("streams a turn for the latest unanswered user message", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const automation = await createWebChatAutomation({ organizationSlug, headers });
    const created = await postVisitorMessage({
      organizationSlug,
      automationId: automation.id,
      text: "What is the refund policy?",
    });
    expect(created.response.status).toBe(201);

    const response = await app.request(
      `/api/public/web-chat/${organizationSlug}/${automation.id}/conversations/${created.body.conversation.id}/chat`,
      {
        method: "POST",
        headers: {
          cookie: created.cookie,
          "Content-Type": "application/json",
        },
        body: chatRequestBody(created.body.message.id),
      },
    );
    expect(response.status).toBe(200);
    expect(createWebChatAgentUIStreamResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: created.body.conversation.id,
        lastUserMessageId: created.body.message.id,
      }),
    );
  });

  it("rejects a stale user message id before starting a stream", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const automation = await createWebChatAutomation({ organizationSlug, headers });
    const first = await postVisitorMessage({
      organizationSlug,
      automationId: automation.id,
      text: "first",
    });
    expect(first.response.status).toBe(201);
    const second = await postVisitorMessage({
      organizationSlug,
      automationId: automation.id,
      text: "second",
      cookie: first.cookie,
    });
    expect(second.response.status).toBe(201);

    const response = await app.request(
      `/api/public/web-chat/${organizationSlug}/${automation.id}/conversations/${first.body.conversation.id}/chat`,
      {
        method: "POST",
        headers: {
          cookie: first.cookie,
          "Content-Type": "application/json",
        },
        body: chatRequestBody(first.body.message.id),
      },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "stale_user_message" });
    expect(createWebChatAgentUIStreamResponseMock).not.toHaveBeenCalled();
  });

  it("rejects a replayed user message after an assistant reply", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const automation = await createWebChatAutomation({ organizationSlug, headers });
    const created = await postVisitorMessage({
      organizationSlug,
      automationId: automation.id,
      text: "Need a recap",
    });
    expect(created.response.status).toBe(201);

    await addInteractionMessage({
      interactionId: created.body.conversation.id,
      senderType: "agent",
      text: "Here is the recap.",
    });

    const response = await app.request(
      `/api/public/web-chat/${organizationSlug}/${automation.id}/conversations/${created.body.conversation.id}/chat`,
      {
        method: "POST",
        headers: {
          cookie: created.cookie,
          "Content-Type": "application/json",
        },
        body: chatRequestBody(created.body.message.id),
      },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "turn_already_processed" });
    expect(createWebChatAgentUIStreamResponseMock).not.toHaveBeenCalled();
  });

  it("covers every attached image in the streamed upload limit", () => {
    expect(WEB_CHAT_MAX_IMAGE_REQUEST_BYTES).toBeGreaterThan(
      WEB_CHAT_MAX_IMAGE_FILES * WEB_CHAT_MAX_IMAGE_BYTES,
    );
  });

  it("rejects oversized uploads from content-length before parsing", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const automation = await createWebChatAutomation({ organizationSlug, headers });

    const response = await app.request(
      `/api/public/web-chat/${organizationSlug}/${automation.id}/messages`,
      {
        method: "POST",
        headers: {
          "content-length": String(WEB_CHAT_MAX_IMAGE_REQUEST_BYTES + 1),
          "content-type": "multipart/form-data; boundary=----test",
        },
        body: "x",
      },
    );
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: "upload_too_large" });
  });
});
