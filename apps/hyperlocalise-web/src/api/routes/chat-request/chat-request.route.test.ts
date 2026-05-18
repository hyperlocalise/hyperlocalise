import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import type { FileStorageAdapter, PutStoredObjectInput } from "@/lib/file-storage";
import { createProjectTestFixture } from "../project/project.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(() => globalThis.__testApiAuthContext ?? null),
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

function createMemoryFileStorageAdapter(): FileStorageAdapter {
  return {
    provider: "vercel_blob",
    async put(input: PutStoredObjectInput) {
      return {
        provider: "vercel_blob",
        key: input.key,
        url: `https://blob.example/${input.key}`,
        downloadUrl: `https://blob.example/${input.key}?download=1`,
        contentType: input.contentType,
        etag: "test-etag",
      };
    },
    async get() {
      return null;
    },
    async delete() {},
    async getSignedUrl() {
      return null;
    },
  };
}

const app = createApp({ fileStorageAdapter: createMemoryFileStorageAdapter() });
const client = testClient(app);
const { authHeadersFor, cleanup, createProjectViaApi, createWorkosIdentity } =
  createProjectTestFixture(client);

afterEach(async () => {
  vi.clearAllMocks();
  await cleanup();
});

describe("chat request uploads", () => {
  it("stores translation source files and links them to the chat message", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };
    const headers = await authHeadersFor(identity);
    const formData = new FormData();
    formData.set("text", "Translate this to fr-FR");
    formData.set("projectId", projectBody.project.id);
    formData.append(
      "files",
      new File([JSON.stringify({ hello: "Hello" })], "source.json", {
        type: "application/json",
      }),
    );

    const response = await app.request(
      `/api/orgs/${identity.organization.slug}/chat-requests/upload`,
      {
        method: "POST",
        headers,
        body: formData,
      },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      conversation: { id: string };
      files: Array<{ id: string; filename: string; sourceInteractionId: string }>;
    };
    expect(body.files).toHaveLength(1);
    expect(body.files[0]).toMatchObject({
      filename: "source.json",
      sourceInteractionId: body.conversation.id,
    });

    const [message] = await db
      .select()
      .from(schema.interactionMessages)
      .where(eq(schema.interactionMessages.interactionId, body.conversation.id))
      .limit(1);

    expect(message?.attachments).toEqual([
      expect.objectContaining({
        id: body.files[0]!.id,
        filename: "source.json",
        contentType: "application/json",
      }),
    ]);
  });

  it("rejects unsupported translation source files", async () => {
    const identity = createWorkosIdentity();
    const headers = await authHeadersFor(identity);
    const formData = new FormData();
    formData.set("text", "Translate this");
    formData.append("files", new File(["hello"], "source.txt", { type: "text/plain" }));

    const response = await app.request(
      `/api/orgs/${identity.organization.slug}/chat-requests/upload`,
      {
        method: "POST",
        headers,
        body: formData,
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "unsupported_translation_source_file",
      filename: "source.txt",
    });
  });

  it("rejects image uploads until visual asset jobs are available", async () => {
    const identity = createWorkosIdentity();
    const headers = await authHeadersFor(identity);
    const formData = new FormData();
    formData.set("text", "Localize this campaign image");
    formData.append("files", new File(["image"], "banner.png", { type: "image/png" }));

    const response = await app.request(
      `/api/orgs/${identity.organization.slug}/chat-requests/upload`,
      {
        method: "POST",
        headers,
        body: formData,
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "unsupported_translation_source_file",
      filename: "banner.png",
    });
  });
});
