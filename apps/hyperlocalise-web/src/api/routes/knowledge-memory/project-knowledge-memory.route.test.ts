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

import { testClient } from "hono/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  resolveApiAuthContextFromSessionMock,
  workspaceKnowledgeFlagRunMock,
  getTmsProviderLiveProjectMock,
} = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  workspaceKnowledgeFlagRunMock: vi.fn(async () => true),
  getTmsProviderLiveProjectMock: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/flags/workspace-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workspace-flags")>();
  return {
    ...actual,
    workspaceKnowledgeFlag: { run: workspaceKnowledgeFlagRunMock },
  };
});

vi.mock("@/lib/providers/jobs/tms-provider-live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/jobs/tms-provider-live")>();
  return {
    ...actual,
    getTmsProviderLiveProject: (...args: unknown[]) => getTmsProviderLiveProjectMock(...args),
  };
});

import { eq } from "drizzle-orm";

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import type { KnowledgeMemoryRecord } from "@/api/routes/knowledge-memory/knowledge-memory.schema";
import { db, schema } from "@/lib/database/client";
import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import {
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

const client = testClient<AppType>(createApp());
const fixture = createProjectTestFixture();

function knowledgeMemoryFromResponseBody(body: unknown): KnowledgeMemoryRecord {
  if (
    typeof body !== "object" ||
    body === null ||
    !("knowledgeMemory" in body) ||
    typeof body.knowledgeMemory !== "object" ||
    body.knowledgeMemory === null
  ) {
    throw new Error("expected a Knowledge Memory response");
  }
  return body.knowledgeMemory as KnowledgeMemoryRecord;
}

function projectKnowledgeMemory() {
  return client.api.orgs[":organizationSlug"].projects[":projectId"]["knowledge-memory"];
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  workspaceKnowledgeFlagRunMock.mockResolvedValue(true);
  getTmsProviderLiveProjectMock.mockReset();
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("projectKnowledgeMemoryRoutes", () => {
  it("denies project memory access when the feature flag is disabled", async () => {
    workspaceKnowledgeFlagRunMock.mockResolvedValue(false);
    const { identity, project } = await fixture.createStoredProjectFixture();
    const headers = await fixture.authHeadersFor(identity);

    const response = await projectKnowledgeMemory().$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "feature_unavailable",
    });
  });

  it("loads an empty project memory before one is saved", async () => {
    const { identity, project } = await fixture.createStoredProjectFixture();
    const headers = await fixture.authHeadersFor(identity);

    const response = await projectKnowledgeMemory().$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"0"');
    await expect(response.json()).resolves.toEqual({
      knowledgeMemory: {
        revisionId: null,
        version: 0,
        content: "",
        summary: null,
        updatedAt: null,
        updatedByUserId: null,
      },
    });
  });

  it("returns not found for an inaccessible project", async () => {
    const { identity } = await fixture.createStoredProjectFixture();
    const headers = await fixture.authHeadersFor(identity);

    const response = await projectKnowledgeMemory().$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: "project_missing",
        },
      },
      { headers },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "project_not_found",
    });
  });

  it("commits and reloads project guidance independently from workspace memory", async () => {
    const { identity, project } = await fixture.createStoredProjectFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const projectResponse = await projectKnowledgeMemory().$put(
      {
        param: { organizationSlug, projectId: project.id },
        json: { content: "Checkout buttons stay short.", summary: "Add checkout guidance" },
      },
      { headers: { ...headers, "If-Match": '"0"' } },
    );
    expect(projectResponse.status).toBe(200);
    const projectMemory = knowledgeMemoryFromResponseBody(await projectResponse.json());
    expect(projectMemory).toMatchObject({
      version: 1,
      content: "Checkout buttons stay short.",
      summary: "Add checkout guidance",
    });

    const workspaceResponse = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$put(
      {
        param: { organizationSlug },
        json: { content: "Workspace voice is calm.", summary: "Add workspace voice" },
      },
      { headers: { ...headers, "If-Match": '"0"' } },
    );
    expect(workspaceResponse.status).toBe(200);

    const reloadedProject = await projectKnowledgeMemory().$get(
      { param: { organizationSlug, projectId: project.id } },
      { headers },
    );
    expect(reloadedProject.status).toBe(200);
    await expect(reloadedProject.json()).resolves.toMatchObject({
      knowledgeMemory: {
        version: 1,
        content: "Checkout buttons stay short.",
      },
    });

    const reloadedWorkspace = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$get(
      { param: { organizationSlug } },
      { headers },
    );
    await expect(reloadedWorkspace.json()).resolves.toMatchObject({
      knowledgeMemory: {
        content: "Workspace voice is calm.",
      },
    });
  });

  it("rejects a stale project memory commit", async () => {
    const { identity, project } = await fixture.createStoredProjectFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const firstResponse = await projectKnowledgeMemory().$put(
      {
        param: { organizationSlug, projectId: project.id },
        json: { content: "First draft" },
      },
      { headers: { ...headers, "If-Match": '"0"' } },
    );
    expect(firstResponse.status).toBe(200);

    const staleResponse = await projectKnowledgeMemory().$put(
      {
        param: { organizationSlug, projectId: project.id },
        json: { content: "Stale draft" },
      },
      { headers: { ...headers, "If-Match": '"0"' } },
    );
    expect(staleResponse.status).toBe(412);
    await expect(staleResponse.json()).resolves.toMatchObject({
      error: "knowledge_memory_precondition_failed",
    });
  });

  it("materializes a live TMS project before saving guideline", async () => {
    const { identity, organization, user } = await fixture.createLocalWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const externalProjectId = "902807";
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId,
    });
    const encrypted = unwrapProviderCredentialCrypto(encryptProviderCredential("crowdin-token"));

    await db.insert(schema.organizationExternalTmsProviderCredentials).values({
      organizationId: organization.id,
      providerKind: "crowdin",
      displayName: "Crowdin",
      authMode: "api_token",
      encryptionAlgorithm: encrypted.algorithm,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      maskedSecretSuffix: "••••ken",
      validationStatus: "valid",
      createdByUserId: user.id,
      updatedByUserId: user.id,
    });

    getTmsProviderLiveProjectMock.mockResolvedValue({
      id: projectId,
      name: "Help Center",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      externalProjectUrl: "https://crowdin.com/project/help-center",
      isActive: true,
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId,
      description: null,
      translationContext: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const getResponse = await projectKnowledgeMemory().$get(
      { param: { organizationSlug, projectId } },
      { headers },
    );
    expect(getResponse.status).toBe(200);

    const putResponse = await projectKnowledgeMemory().$put(
      {
        param: { organizationSlug, projectId },
        json: { content: "Keep Crowdin checkout labels short.", summary: "Add checkout guidance" },
      },
      { headers: { ...headers, "If-Match": '"0"' } },
    );
    expect(putResponse.status).toBe(200);
    expect(knowledgeMemoryFromResponseBody(await putResponse.json())).toMatchObject({
      version: 1,
      content: "Keep Crowdin checkout labels short.",
    });

    const [materialized] = await db
      .select({ id: schema.projects.id, source: schema.projects.source })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1);
    expect(materialized).toMatchObject({ id: projectId, source: "external_tms" });

    const [memory] = await db
      .select({ content: schema.projectKnowledgeMemories.content })
      .from(schema.projectKnowledgeMemories)
      .where(eq(schema.projectKnowledgeMemories.projectId, projectId))
      .limit(1);
    expect(memory?.content).toBe("Keep Crowdin checkout labels short.");
  });

  it("does not insert a guideline when a live TMS project cannot be materialized", async () => {
    const { identity } = await fixture.createLocalWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902807",
    });

    getTmsProviderLiveProjectMock.mockResolvedValue({
      id: projectId,
      name: "Help Center",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      externalProjectUrl: "https://crowdin.com/project/help-center",
      isActive: true,
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "902807",
      description: null,
      translationContext: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const putResponse = await projectKnowledgeMemory().$put(
      {
        param: { organizationSlug, projectId },
        json: { content: "Do not persist this guidance.", summary: "Blocked live project" },
      },
      { headers: { ...headers, "If-Match": '"0"' } },
    );

    expect(putResponse.status).toBe(404);
    await expect(putResponse.json()).resolves.toMatchObject({
      error: "project_not_found",
    });

    const [memory] = await db
      .select({ projectId: schema.projectKnowledgeMemories.projectId })
      .from(schema.projectKnowledgeMemories)
      .where(eq(schema.projectKnowledgeMemories.projectId, projectId))
      .limit(1);
    expect(memory).toBeUndefined();
  });
});
