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

const { checkBotIdMock, resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  checkBotIdMock: vi.fn(),
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
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

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database";
import { createMemoryFileStorageAdapter } from "../file/file.fixture";

const fileStorageAdapter = createMemoryFileStorageAdapter();
const app = createApp({ fileStorageAdapter });
const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  checkBotIdMock.mockResolvedValue({ isBot: false });
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

describe("public web chat routes", () => {
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
});
