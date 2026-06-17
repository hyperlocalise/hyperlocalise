import "dotenv/config";

import { randomUUID } from "node:crypto";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import { upsertOrganizationExternalTmsProviderCredential } from "@/lib/providers/organization-external-tms-provider-credentials";
import { encodeProviderProjectId } from "@/lib/providers/tms-provider-resource-id";

import { createProjectTestFixture } from "./project.fixture";
import type { ProjectResponse } from "./project.schema";

const { getTmsProviderLiveProjectMock, resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  getTmsProviderLiveProjectMock: vi.fn(),
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

vi.mock("@/lib/providers/tms-provider-live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/tms-provider-live")>();
  return {
    ...actual,
    getTmsProviderLiveProject: getTmsProviderLiveProjectMock,
  };
});

const client = testClient(app);
const projectFixture = createProjectTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

describe("project detail route", () => {
  it("returns a materialized external TMS project when the live provider lookup misses", async () => {
    const admin = projectFixture.createWorkosIdentityWithRole("admin");
    const headers = await projectFixture.authHeadersFor(admin);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;
    const externalProjectId = "902807";
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId,
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
      organizationId,
      teamId: null,
      createdByUserId: userId,
      updatedByUserId: userId,
      name: "Materialized Crowdin Project",
      description: "Stored after provider sync",
      translationContext: "Use a concise help-center tone.",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProviderCredentialId: credential.id,
      externalProjectId,
      sourceLocale: "en",
      targetLocales: ["fr", "de"],
      isActive: true,
    });
    await db.insert(schema.jobs).values({
      id: `job_${randomUUID()}`,
      organizationId,
      projectId,
      createdByUserId: userId,
      ownerUserId: null,
      kind: "translation",
      status: "queued",
      inputPayload: {
        sourceText: "Hello",
        sourceLocale: "en",
        targetLocales: ["fr"],
      },
    });
    getTmsProviderLiveProjectMock.mockResolvedValue(null);

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$get(
      {
        param: {
          organizationSlug: admin.organization.slug ?? "missing-slug",
          projectId,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectResponse;
    expect(body.project).toMatchObject({
      id: projectId,
      organizationId,
      name: "Materialized Crowdin Project",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId,
      sourceLocale: "en",
      targetLocales: ["fr", "de"],
      openJobCount: 1,
    });
    expect(getTmsProviderLiveProjectMock).toHaveBeenCalledWith(organizationId, externalProjectId, {
      actorUserId: userId,
    });
  });
});
