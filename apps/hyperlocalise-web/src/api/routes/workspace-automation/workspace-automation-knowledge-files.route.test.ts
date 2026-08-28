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
import { db, schema } from "@/lib/database/client";
import { createMemoryFileStorageAdapter } from "../file/file.fixture";

const fileStorageAdapter = createMemoryFileStorageAdapter();
const app = createApp({ fileStorageAdapter });
const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("workspace automation knowledge files", () => {
  it("uploads, lists, and deletes a knowledge file for an operator", async () => {
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
        name: "Support chat",
        instructions: "Answer product questions from the uploaded files.",
        triggerConfig: { mode: "web_chat" },
        repositoryTarget: { kind: "none" },
        toolConfig: { knowledgeFiles: { enabled: true } },
      }),
    });
    expect(createdResponse.status).toBe(201);
    const createdBody = (await createdResponse.json()) as { automation: { id: string } };

    const formData = new FormData();
    formData.set(
      "file",
      new File(["Refunds take five business days."], "refunds.txt", { type: "text/plain" }),
    );

    const uploadResponse = await app.request(
      `/api/orgs/${organizationSlug}/automations/${createdBody.automation.id}/knowledge-files`,
      {
        method: "POST",
        headers,
        body: formData,
      },
    );
    expect(uploadResponse.status).toBe(201);
    const uploaded = (await uploadResponse.json()) as {
      knowledgeFile: { id: string; filename: string; extractedCharacterCount: number };
    };
    expect(uploaded.knowledgeFile).toMatchObject({
      filename: "refunds.txt",
    });
    expect(uploaded.knowledgeFile.extractedCharacterCount).toBeGreaterThan(0);

    const listedResponse = await app.request(
      `/api/orgs/${organizationSlug}/automations/${createdBody.automation.id}/knowledge-files`,
      { headers },
    );
    expect(listedResponse.status).toBe(200);
    await expect(listedResponse.json()).resolves.toMatchObject({
      knowledgeFiles: [{ id: uploaded.knowledgeFile.id, filename: "refunds.txt" }],
    });

    const deleteResponse = await app.request(
      `/api/orgs/${organizationSlug}/automations/${createdBody.automation.id}/knowledge-files/${uploaded.knowledgeFile.id}`,
      { method: "DELETE", headers },
    );
    expect(deleteResponse.status).toBe(204);

    const [remaining] = await db
      .select({ id: schema.workspaceAutomationKnowledgeFiles.id })
      .from(schema.workspaceAutomationKnowledgeFiles)
      .where(eq(schema.workspaceAutomationKnowledgeFiles.id, uploaded.knowledgeFile.id))
      .limit(1);
    expect(remaining).toBeUndefined();
  });

  it("rejects unsupported knowledge file types", async () => {
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
        name: "Support chat",
        instructions: "Answer product questions.",
        triggerConfig: { mode: "web_chat" },
        repositoryTarget: { kind: "none" },
        toolConfig: { knowledgeFiles: { enabled: true } },
      }),
    });
    expect(createdResponse.status).toBe(201);
    const createdBody = (await createdResponse.json()) as { automation: { id: string } };

    const formData = new FormData();
    formData.set("file", new File(["not a document"], "photo.png", { type: "image/png" }));

    const uploadResponse = await app.request(
      `/api/orgs/${organizationSlug}/automations/${createdBody.automation.id}/knowledge-files`,
      {
        method: "POST",
        headers,
        body: formData,
      },
    );
    expect(uploadResponse.status).toBe(400);
    await expect(uploadResponse.json()).resolves.toMatchObject({
      error: "unsupported_knowledge_file",
    });
  });
});
