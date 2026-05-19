import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";
import { createGithubWebhookRoutes } from "./github-webhook.route";

const fixture = createProjectTestFixture();

async function createStoredGithubInstallation(enabled: boolean) {
  const identity = fixture.createWorkosIdentity();
  await fixture.authHeadersFor(identity);
  const auth = globalThis.__testApiAuthContext;
  if (!auth) {
    throw new Error("missing auth context");
  }

  await db.insert(schema.githubInstallations).values({
    organizationId: auth.organization.localOrganizationId,
    githubInstallationId: "54321",
    githubAppId: "123",
    accountLogin: "hyperlocalise",
    accountType: "Organization",
  });
  await db.insert(schema.githubInstallationRepositories).values({
    organizationId: auth.organization.localOrganizationId,
    githubInstallationId: "54321",
    githubRepositoryId: "9001",
    owner: "hyperlocalise",
    name: "hyperlocalise",
    fullName: "hyperlocalise/hyperlocalise",
    private: false,
    archived: false,
    defaultBranch: "main",
    enabled,
  });

  return auth;
}

describe("githubWebhookRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("delegates enabled repository webhooks to the Chat SDK bot handler", async () => {
    await createStoredGithubInstallation(true);
    let called = false;
    const app = createGithubWebhookRoutes({
      githubWebhookHandler: async (request) => {
        called = true;
        expect(request.method).toBe("POST");
        return Response.json({ ok: true });
      },
    });

    const response = await app.request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "issue_comment",
      },
      body: JSON.stringify({
        action: "created",
        installation: { id: 54321 },
        repository: { id: 9001 },
      }),
    });

    expect(response.status).toBe(200);
    expect(called).toBe(true);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("ignores unknown installations without delegating to the bot handler", async () => {
    let called = false;
    const app = createGithubWebhookRoutes({
      githubWebhookHandler: async () => {
        called = true;
        return Response.json({ ok: true });
      },
    });

    const response = await app.request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "issue_comment",
      },
      body: JSON.stringify({
        action: "created",
        installation: { id: 99999 },
        repository: { id: 9001 },
      }),
    });

    expect(response.status).toBe(200);
    expect(called).toBe(false);
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true });
  });

  it("ignores disabled repositories without delegating to the bot handler", async () => {
    await createStoredGithubInstallation(false);
    let called = false;
    const app = createGithubWebhookRoutes({
      githubWebhookHandler: async () => {
        called = true;
        return Response.json({ ok: true });
      },
    });

    const response = await app.request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "issue_comment",
      },
      body: JSON.stringify({
        action: "created",
        installation: { id: 54321 },
        repository: { id: 9001 },
      }),
    });

    expect(response.status).toBe(200);
    expect(called).toBe(false);
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true });
  });

  it("syncs installation repository webhook additions", async () => {
    const auth = await createStoredGithubInstallation(false);
    const app = createGithubWebhookRoutes({
      githubWebhookHandler: async () => Response.json({ ok: true }),
    });

    const response = await app.request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "installation_repositories",
      },
      body: JSON.stringify({
        action: "added",
        installation: { id: 54321 },
        repositories_added: [
          {
            id: 9002,
            name: "demo",
            full_name: "hyperlocalise/demo",
            private: true,
            archived: false,
            default_branch: "main",
            owner: { login: "hyperlocalise" },
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const [repository] = await db
      .select()
      .from(schema.githubInstallationRepositories)
      .where(eq(schema.githubInstallationRepositories.githubRepositoryId, "9002"));
    expect(repository).toMatchObject({
      organizationId: auth.organization.localOrganizationId,
      fullName: "hyperlocalise/demo",
      private: true,
      enabled: false,
    });
  });
});
