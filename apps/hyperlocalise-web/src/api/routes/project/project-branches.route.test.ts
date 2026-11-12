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

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { testClient } from "hono/testing";

import { app } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { upsertOrganizationExternalTmsProviderCredential } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

import { createProjectTestFixture } from "./project.fixture";
import type { ProjectBranchApiRecord } from "./project-branches.schema";

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

const client = testClient<AppType>(app);
const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

type BranchesResponse = { branches: ProjectBranchApiRecord[] };
type BranchResponse = { branch: ProjectBranchApiRecord };

describe("project version branch routes", () => {
  it("seeds and lists the default main branch for native projects", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].branches.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as BranchesResponse;
    expect(body.branches).toHaveLength(1);
    expect(body.branches[0]).toMatchObject({
      name: "main",
      isDefault: true,
      isProtected: false,
      status: "active",
    });
  });

  it("creates, protects, merges, and deletes a native version branch", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const param = {
      organizationSlug: identity.organization.slug ?? "missing-slug",
      projectId: project.id,
    };

    const createdResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].branches.$post(
      {
        param,
        json: {
          name: "feature-checkout",
          title: "Checkout",
        },
      },
      { headers },
    );
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as BranchResponse;
    expect(created.branch).toMatchObject({
      name: "feature-checkout",
      title: "Checkout",
      isDefault: false,
      status: "active",
    });

    const protectedResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].branches[":branchName"].$patch(
      {
        param: { ...param, branchName: "feature-checkout" },
        json: { isProtected: true },
      },
      { headers },
    );
    expect(protectedResponse.status).toBe(200);
    const protectedBody = (await protectedResponse.json()) as BranchResponse;
    expect(protectedBody.branch.isProtected).toBe(true);

    await client.api.orgs[":organizationSlug"].projects[":projectId"].branches[
      ":branchName"
    ].$patch(
      {
        param: { ...param, branchName: "feature-checkout" },
        json: { isProtected: false },
      },
      { headers },
    );

    const mergedResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].branches[":branchName"].merge.$post(
      {
        param: { ...param, branchName: "feature-checkout" },
        json: { strategy: "use_branch" },
      },
      { headers },
    );
    expect(mergedResponse.status).toBe(200);
    const merged = (await mergedResponse.json()) as BranchResponse;
    expect(merged.branch).toMatchObject({
      name: "main",
      status: "active",
    });

    const listed = await client.api.orgs[":organizationSlug"].projects[":projectId"].branches.$get(
      { param },
      { headers },
    );
    const listedBody = (await listed.json()) as BranchesResponse;
    expect(
      listedBody.branches.map((branch) => ({ name: branch.name, status: branch.status })),
    ).toEqual(
      expect.arrayContaining([
        { name: "main", status: "active" },
        { name: "feature-checkout", status: "merged" },
      ]),
    );

    const extraResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].branches.$post(
      {
        param,
        json: { name: "release-ios" },
      },
      { headers },
    );
    expect(extraResponse.status).toBe(201);

    const deleteResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].branches[":branchName"].$delete(
      {
        param: { ...param, branchName: "release-ios" },
      },
      { headers },
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("rejects version branches on connected TMS projects", async () => {
    const admin = projectFixture.createWorkosIdentityWithRole("admin");
    const headers = await projectFixture.authHeadersFor(admin);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902811",
    });

    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });
    await db.insert(schema.projects).values({
      id: projectId,
      identifier: uniqueTestProjectIdentifier(),
      organizationId,
      teamId: null,
      createdByUserId: userId,
      name: "Crowdin Project",
      description: "",
      translationContext: "",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProviderCredentialId: credential.id,
      externalProjectId: "902811",
      sourceLocale: "en",
      targetLocales: ["fr"],
      isActive: true,
    });

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].branches.$get(
      {
        param: {
          organizationSlug: admin.organization.slug ?? "missing-slug",
          projectId,
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "native_project_required",
    });
  });
});
