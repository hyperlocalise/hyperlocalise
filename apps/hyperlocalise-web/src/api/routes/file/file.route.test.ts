import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { testClient } from "hono/testing";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import { createStoredFile } from "@/lib/file-storage/records";
import { createProjectTestFixture } from "../project/project.fixture";
import type { ProjectResponse } from "../project/project.schema";
import { createTeamTestFixture } from "../team/team.fixture";
import type { TeamResponse } from "../team/team.schema";
import { createMemoryFileStorageAdapter } from "./file.fixture";

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

const fileStorageAdapter = createMemoryFileStorageAdapter();
const app = createApp({ fileStorageAdapter });
const client = testClient(app);
const projectFixture = createProjectTestFixture(client);
const teamFixture = createTeamTestFixture(client);
const {
  authHeadersFor,
  cleanup,
  createWorkosIdentity,
  createWorkosIdentityWithRole,
  createWorkosIdentityForOrganization,
  getLocalUserId,
} = projectFixture;

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanup();
});

describe("file download route", () => {
  it("streams a stored file when the user belongs to the organization", async () => {
    const identity = createWorkosIdentityWithRole("member");
    const headers = await authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const orgId = auth.activeOrganization.localOrganizationId;
    const fileContent = Buffer.from(JSON.stringify({ hello: "world" }));

    const file = await createStoredFile({
      organizationId: orgId,
      createdByUserId: auth.user.localUserId,
      role: "source",
      sourceKind: "chat_upload",
      filename: "source.json",
      contentType: "application/json",
      content: fileContent,
      adapter: fileStorageAdapter,
    });

    const response = await app.request(`/api/orgs/${identity.organization.slug}/files/${file.id}`, {
      method: "GET",
      headers,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("content-disposition")).toContain("source.json");
  });

  it("returns 404 when the file does not exist", async () => {
    const identity = createWorkosIdentity();
    const headers = await authHeadersFor(identity);

    const response = await app.request(
      `/api/orgs/${identity.organization.slug}/files/file_missing`,
      {
        method: "GET",
        headers,
      },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "not_found", message: expect.any(String) });
  });

  it("returns 404 when the file belongs to another organization", async () => {
    const identityA = createWorkosIdentity();
    const identityB = createWorkosIdentity();
    const headersA = await authHeadersFor(identityA);
    const authContextA = globalThis.__testApiAuthContext!;

    // Switch to identityB and create a file in orgB
    await authHeadersFor(identityB);
    const orgIdB = globalThis.__testApiAuthContext!.activeOrganization.localOrganizationId;

    const file = await createStoredFile({
      organizationId: orgIdB,
      role: "source",
      sourceKind: "chat_upload",
      filename: "source.json",
      contentType: "application/json",
      content: Buffer.from("secret"),
      adapter: fileStorageAdapter,
    });

    // Restore identityA auth context and request
    globalThis.__testApiAuthContext = authContextA;
    const response = await app.request(
      `/api/orgs/${identityA.organization.slug}/files/${file.id}`,
      {
        method: "GET",
        headers: headersA,
      },
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when a member downloads another user's workspace file", async () => {
    const uploader = createWorkosIdentityWithRole("member");
    const requester = createWorkosIdentityForOrganization(uploader.organization, "member");

    await authHeadersFor(uploader);
    const orgId = globalThis.__testApiAuthContext!.activeOrganization.localOrganizationId;
    const uploaderUserId = globalThis.__testApiAuthContext!.user.localUserId;

    const workspaceFile = await createStoredFile({
      organizationId: orgId,
      createdByUserId: uploaderUserId,
      role: "source",
      sourceKind: "chat_upload",
      filename: "workspace-secret.json",
      contentType: "application/json",
      content: Buffer.from('{"scope":"workspace"}'),
      adapter: fileStorageAdapter,
    });

    const response = await app.request(
      `/api/orgs/${uploader.organization.slug}/files/${workspaceFile.id}`,
      {
        method: "GET",
        headers: await authHeadersFor(requester),
      },
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when a member downloads a file from another team's project", async () => {
    const admin = createWorkosIdentityWithRole("admin");
    const member = createWorkosIdentityForOrganization(admin.organization, "member");

    await authHeadersFor(admin);
    await authHeadersFor(member);

    const teamBetaResponse = await teamFixture.createTeamViaApi(admin, { name: "Beta Team" });
    expect(teamBetaResponse.status).toBe(201);
    const teamBetaBody = (await teamBetaResponse.json()) as TeamResponse;

    const betaProjectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: admin.organization.slug ?? "missing-slug" },
        json: {
          name: "Beta Project",
          teamId: teamBetaBody.team.id,
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      },
      { headers: await authHeadersFor(admin) },
    );
    expect(betaProjectResponse.status).toBe(201);
    const betaProjectBody = (await betaProjectResponse.json()) as ProjectResponse;

    const orgId = globalThis.__testApiAuthContext!.activeOrganization.localOrganizationId;
    const betaFile = await createStoredFile({
      organizationId: orgId,
      projectId: betaProjectBody.project.id,
      role: "source",
      sourceKind: "chat_upload",
      filename: "beta-secret.json",
      contentType: "application/json",
      content: Buffer.from('{"team":"beta"}'),
      adapter: fileStorageAdapter,
    });

    const teamAlphaResponse = await teamFixture.createTeamViaApi(admin, { name: "Alpha Team" });
    expect(teamAlphaResponse.status).toBe(201);
    const teamAlphaBody = (await teamAlphaResponse.json()) as TeamResponse;

    await db.insert(schema.teamMemberships).values({
      teamId: teamAlphaBody.team.id,
      userId: await getLocalUserId(member.user.workosUserId),
      role: "member",
    });

    const response = await app.request(
      `/api/orgs/${admin.organization.slug}/files/${betaFile.id}`,
      {
        method: "GET",
        headers: await authHeadersFor(member),
      },
    );

    expect(response.status).toBe(404);
  });

  it("streams a stored file when a member belongs to the file project's team", async () => {
    const admin = createWorkosIdentityWithRole("admin");
    const member = createWorkosIdentityForOrganization(admin.organization, "member");

    await authHeadersFor(admin);
    await authHeadersFor(member);

    const teamResponse = await teamFixture.createTeamViaApi(admin, { name: "Team Files" });
    expect(teamResponse.status).toBe(201);
    const teamBody = (await teamResponse.json()) as TeamResponse;

    await db.insert(schema.teamMemberships).values({
      teamId: teamBody.team.id,
      userId: await getLocalUserId(member.user.workosUserId),
      role: "member",
    });

    const projectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: admin.organization.slug ?? "missing-slug" },
        json: {
          name: "Team Files Project",
          teamId: teamBody.team.id,
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      },
      { headers: await authHeadersFor(admin) },
    );
    expect(projectResponse.status).toBe(201);
    const projectBody = (await projectResponse.json()) as ProjectResponse;

    const orgId = globalThis.__testApiAuthContext!.activeOrganization.localOrganizationId;
    const fileContent = Buffer.from('{"team":"files"}');
    const file = await createStoredFile({
      organizationId: orgId,
      projectId: projectBody.project.id,
      role: "source",
      sourceKind: "chat_upload",
      filename: "team-files.json",
      contentType: "application/json",
      content: fileContent,
      adapter: fileStorageAdapter,
    });

    const response = await app.request(`/api/orgs/${admin.organization.slug}/files/${file.id}`, {
      method: "GET",
      headers: await authHeadersFor(member),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("content-disposition")).toContain("team-files.json");
    await expect(response.text()).resolves.toBe(fileContent.toString());
  });
});
