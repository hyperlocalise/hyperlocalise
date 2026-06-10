import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import type { FileStorageAdapter } from "@/lib/file-storage";
import { createMemoryFileStorageAdapter } from "../file/file.fixture";
import { createProjectTestFixture } from "../project/project.fixture";

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

const app = createApp({ fileStorageAdapter: createMemoryFileStorageAdapter() });
const client = testClient(app);
const { authHeadersFor, cleanup, createProjectViaApi, createWorkosIdentity } =
  createProjectTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanup();
});

describe("conversation creation", () => {
  it("creates a chat UI conversation with the initial user message", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };
    const headers = await authHeadersFor(identity);
    const formData = new FormData();
    formData.set("text", "Translate this to fr-FR");
    formData.set("projectId", projectBody.project.id);

    const response = await app.request(`/api/orgs/${identity.organization.slug}/conversations`, {
      method: "POST",
      headers,
      body: formData,
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      conversation: { id: string; source: string; projectId: string };
      message: { id: string; text: string; senderType: string };
    };
    expect(body.conversation).toMatchObject({
      source: "chat_ui",
      projectId: projectBody.project.id,
    });
    expect(body.message).toMatchObject({
      text: "Translate this to fr-FR",
      senderType: "user",
    });
  });

  it("stores initial translation source files on the conversation message", async () => {
    const identity = createWorkosIdentity();
    const headers = await authHeadersFor(identity);
    const formData = new FormData();
    formData.set("text", "Translate the attached file");
    formData.append(
      "files",
      new File([JSON.stringify({ hello: "Hello" })], "source.json", {
        type: "application/json",
      }),
    );

    const response = await app.request(`/api/orgs/${identity.organization.slug}/conversations`, {
      method: "POST",
      headers,
      body: formData,
    });

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

  it("does not leave an inbox conversation when initial file upload fails", async () => {
    const failingAdapter: FileStorageAdapter = {
      provider: "vercel_blob",
      put: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
      get: vi.fn(async () => null),
      delete: vi.fn(async () => {}),
      getSignedUrl: vi.fn(async () => "https://blob.example/signed"),
    };
    const failingApp = createApp({ fileStorageAdapter: failingAdapter });
    const identity = createWorkosIdentity();
    const headers = await authHeadersFor(identity);
    const formData = new FormData();
    formData.set("text", "Translate the attached file");
    formData.append(
      "files",
      new File([JSON.stringify({ hello: "Hello" })], "source.json", {
        type: "application/json",
      }),
    );

    const response = await failingApp.request(
      `/api/orgs/${identity.organization.slug}/conversations`,
      {
        method: "POST",
        headers,
        body: formData,
      },
    );

    expect(response.status).toBe(500);

    const organizationId = globalThis.__testApiAuthContext?.activeOrganization.localOrganizationId;
    if (!organizationId) {
      throw new Error("Expected test auth context to include an active organization");
    }
    const conversations = await db
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.organizationId, organizationId));
    const inboxItems = await db
      .select()
      .from(schema.inboxItems)
      .where(eq(schema.inboxItems.organizationId, organizationId));
    const storedFiles = await db
      .select()
      .from(schema.storedFiles)
      .where(eq(schema.storedFiles.organizationId, organizationId));

    expect(conversations).toHaveLength(0);
    expect(inboxItems).toHaveLength(0);
    expect(storedFiles).toHaveLength(0);
  });

  it("rejects conversations linked to another organization's project", async () => {
    const identity = createWorkosIdentity();
    const otherIdentity = createWorkosIdentity();
    const otherProjectResponse = await createProjectViaApi(otherIdentity);
    const otherProjectBody = (await otherProjectResponse.json()) as { project: { id: string } };
    const headers = await authHeadersFor(identity);
    const formData = new FormData();
    formData.set("text", "Translate this");
    formData.set("projectId", otherProjectBody.project.id);

    const response = await app.request(`/api/orgs/${identity.organization.slug}/conversations`, {
      method: "POST",
      headers,
      body: formData,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "project_not_found" });
  });
});
