import "dotenv/config";

import { randomInt } from "node:crypto";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import type { FileStorageAdapter } from "@/lib/file-storage";
import { getWebConversationRepositorySession } from "@/lib/agent-runtime/loops/conversation-repository-session";
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
const { createInteractionMock } = vi.hoisted(() => ({
  createInteractionMock: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/conversations/interactions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/conversations/interactions")>();
  createInteractionMock.mockImplementation(actual.createInteraction);
  return {
    ...actual,
    createInteraction: createInteractionMock,
  };
});

const app = createApp({ fileStorageAdapter: createMemoryFileStorageAdapter() });
const client = testClient(app);
const { authHeadersFor, cleanup, createProjectViaApi, createWorkosIdentity } =
  createProjectTestFixture(client);

async function createGithubRepositoryFixture(input: {
  organizationId: string;
  enabled?: boolean;
  fullName?: string;
}) {
  const suffix = randomInt(100_000, 999_999);
  const githubInstallationId = `98${suffix}`;
  const githubRepositoryId = `10${suffix}`;
  const fullName = input.fullName ?? "hyperlocalise/hyperlocalise-web";
  const [owner, name] = fullName.split("/");

  await db.insert(schema.githubInstallations).values({
    organizationId: input.organizationId,
    githubInstallationId,
    githubAppId: "123",
    accountLogin: owner ?? "hyperlocalise",
    accountType: "Organization",
  });

  await db.insert(schema.githubInstallationRepositories).values({
    organizationId: input.organizationId,
    githubInstallationId,
    githubRepositoryId,
    owner: owner ?? "hyperlocalise",
    name: name ?? "hyperlocalise-web",
    fullName,
    private: true,
    archived: false,
    defaultBranch: "main",
    enabled: input.enabled ?? true,
  });

  return { githubInstallationId, githubRepositoryId, fullName };
}

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
    identity.organization.slug = "example org+東京";
    const headers = await authHeadersFor(identity);
    const formData = new FormData();
    formData.set("text", "Translate the attached file");
    formData.append(
      "files",
      new File([JSON.stringify({ hello: "Hello" })], "source.json", {
        type: "application/json",
      }),
    );

    const response = await app.request(
      `/api/orgs/${encodeURIComponent(identity.organization.slug)}/conversations`,
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
        url: `/api/orgs/${encodeURIComponent(identity.organization.slug)}/files/${body.files[0]!.id}`,
      }),
    ]);
  });

  it("seeds selected GitHub repository context when creating a chat UI conversation", async () => {
    const identity = createWorkosIdentity();
    const headers = await authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext?.activeOrganization.localOrganizationId;
    if (!organizationId) {
      throw new Error("Expected test auth context to include an active organization");
    }
    const repository = await createGithubRepositoryFixture({ organizationId });
    const formData = new FormData();
    formData.set("text", "Review the repository localization setup");
    formData.set("repositoryFullName", repository.fullName);

    const response = await app.request(`/api/orgs/${identity.organization.slug}/conversations`, {
      method: "POST",
      headers,
      body: formData,
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      conversation: { id: string };
    };
    const session = getWebConversationRepositorySession(body.conversation.id);
    expect(session?.session.repositoryGitHubContext).toMatchObject({
      resolved: true,
      installationId: Number(repository.githubInstallationId),
      repositoryFullName: repository.fullName,
      branch: "main",
    });
  });

  it("rejects a selected GitHub repository that is not enabled", async () => {
    const identity = createWorkosIdentity();
    const headers = await authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext?.activeOrganization.localOrganizationId;
    if (!organizationId) {
      throw new Error("Expected test auth context to include an active organization");
    }
    const repository = await createGithubRepositoryFixture({
      organizationId,
      enabled: false,
      fullName: "hyperlocalise/disabled-repo",
    });
    const formData = new FormData();
    formData.set("text", "Review the repository localization setup");
    formData.set("repositoryFullName", repository.fullName);

    const response = await app.request(`/api/orgs/${identity.organization.slug}/conversations`, {
      method: "POST",
      headers,
      body: formData,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "github_repository_not_available",
    });
  });

  it("stores reply attachment URLs with an encoded organization slug", async () => {
    const identity = createWorkosIdentity();
    identity.organization.slug = "example org+東京";
    const headers = await authHeadersFor(identity);
    const encodedOrganizationSlug = encodeURIComponent(identity.organization.slug);
    const conversationFormData = new FormData();
    conversationFormData.set("text", "Translate this first");

    const conversationResponse = await app.request(
      `/api/orgs/${encodedOrganizationSlug}/conversations`,
      {
        method: "POST",
        headers,
        body: conversationFormData,
      },
    );
    expect(conversationResponse.status).toBe(201);
    const conversationBody = (await conversationResponse.json()) as {
      conversation: { id: string };
    };
    const replyFormData = new FormData();
    replyFormData.set("text", "Here is another source file");
    replyFormData.append(
      "files",
      new File([JSON.stringify({ goodbye: "Goodbye" })], "reply.json", {
        type: "application/json",
      }),
    );

    const replyResponse = await app.request(
      `/api/orgs/${encodedOrganizationSlug}/conversations/${conversationBody.conversation.id}/messages`,
      {
        method: "POST",
        headers,
        body: replyFormData,
      },
    );

    expect(replyResponse.status).toBe(201);
    const replyBody = (await replyResponse.json()) as {
      message: { attachments: Array<{ id: string; url: string }> };
    };
    expect(replyBody.message.attachments).toEqual([
      expect.objectContaining({
        url: `/api/orgs/${encodedOrganizationSlug}/files/${replyBody.message.attachments[0]!.id}`,
      }),
    ]);
  });

  it("seeds selected GitHub repository context when replying to a chat UI conversation", async () => {
    const identity = createWorkosIdentity();
    const headers = await authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext?.activeOrganization.localOrganizationId;
    if (!organizationId) {
      throw new Error("Expected test auth context to include an active organization");
    }
    const repository = await createGithubRepositoryFixture({ organizationId });
    const conversationFormData = new FormData();
    conversationFormData.set("text", "Start a repository task");
    const conversationResponse = await app.request(
      `/api/orgs/${identity.organization.slug}/conversations`,
      {
        method: "POST",
        headers,
        body: conversationFormData,
      },
    );
    expect(conversationResponse.status).toBe(201);
    const conversationBody = (await conversationResponse.json()) as {
      conversation: { id: string };
    };
    const replyFormData = new FormData();
    replyFormData.set("text", "Use the selected repository for this task");
    replyFormData.set("repositoryFullName", repository.fullName);

    const replyResponse = await app.request(
      `/api/orgs/${identity.organization.slug}/conversations/${conversationBody.conversation.id}/messages`,
      {
        method: "POST",
        headers,
        body: replyFormData,
      },
    );

    expect(replyResponse.status).toBe(201);
    const session = getWebConversationRepositorySession(conversationBody.conversation.id);
    expect(session?.session.repositoryGitHubContext).toMatchObject({
      resolved: true,
      installationId: Number(repository.githubInstallationId),
      repositoryFullName: repository.fullName,
      branch: "main",
    });
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

  it("cleans up initial uploads when conversation creation fails", async () => {
    const adapter = createMemoryFileStorageAdapter();
    const deleteFile = vi.spyOn(adapter, "delete");
    const failingApp = createApp({ fileStorageAdapter: adapter });
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

    createInteractionMock.mockRejectedValueOnce(new Error("database unavailable"));

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
    const storedFiles = await db
      .select()
      .from(schema.storedFiles)
      .where(eq(schema.storedFiles.organizationId, organizationId));

    expect(storedFiles).toHaveLength(0);
    expect(deleteFile).toHaveBeenCalledOnce();
    const deletedFile = deleteFile.mock.calls[0]?.[0];
    expect(deletedFile?.keyOrUrl).toBeTruthy();
    await expect(adapter.get({ keyOrUrl: deletedFile?.keyOrUrl ?? "" })).resolves.toBeNull();
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
