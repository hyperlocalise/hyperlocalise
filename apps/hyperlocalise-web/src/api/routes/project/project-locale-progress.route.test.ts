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
import { testClient } from "hono/testing";

import { app } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { upsertOrganizationExternalTmsProviderCredential } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

import { createProjectTestFixture } from "./project.fixture";
import type { ProjectLocaleProgressResponse } from "./project.schema";

const {
  getTmsProviderLiveProjectMock,
  getTmsProviderLiveProjectLocaleReadinessMock,
  resolveApiAuthContextFromSessionMock,
} = vi.hoisted(() => ({
  getTmsProviderLiveProjectMock: vi.fn(),
  getTmsProviderLiveProjectLocaleReadinessMock: vi.fn(),
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

vi.mock("@/lib/providers/jobs/tms-provider-live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/jobs/tms-provider-live")>();
  return {
    ...actual,
    getTmsProviderLiveProject: getTmsProviderLiveProjectMock,
    getTmsProviderLiveProjectLocaleReadiness: getTmsProviderLiveProjectLocaleReadinessMock,
  };
});

const client = testClient<AppType>(app);
const projectFixture = createProjectTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

describe("GET /projects/:projectId/locale-progress", () => {
  it("aggregates native translation words and strings per locale", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    await db
      .update(schema.projects)
      .set({ targetLocales: ["fr-FR", "de-DE"] })
      .where(eq(schema.projects.id, project.id));

    const [hello, save, hidden] = await db
      .insert(schema.projectTranslationKeys)
      .values([
        {
          organizationId: organization.id,
          projectId: project.id,
          key: "hello",
          sourceText: "Hello world",
          normalizedSourceText: "hello world",
        },
        {
          organizationId: organization.id,
          projectId: project.id,
          key: "save",
          sourceText: "Save",
          normalizedSourceText: "save",
        },
        {
          organizationId: organization.id,
          projectId: project.id,
          key: "debug",
          sourceText: "Internal id",
          normalizedSourceText: "internal id",
          isHidden: true,
        },
      ])
      .returning();

    await db.insert(schema.projectTranslations).values([
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: hello!.id,
        targetLocale: "fr-FR",
        text: "Bonjour le monde",
        status: "approved",
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: save!.id,
        targetLocale: "fr-FR",
        text: "",
        status: "draft",
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId: hidden!.id,
        targetLocale: "fr-FR",
        text: "id interne",
        status: "approved",
      },
    ]);

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "locale-progress"
    ].$get(
      {
        param: {
          organizationSlug: identity.organization.slug!,
          projectId: project.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectLocaleProgressResponse;
    expect(body.locales).toEqual([
      expect.objectContaining({
        locale: "fr-FR",
        translationProgress: 67,
        approvalProgress: 67,
        words: { total: 3, translated: 2, approved: 2 },
        phrases: { total: 2, translated: 1, approved: 1 },
      }),
      expect.objectContaining({
        locale: "de-DE",
        translationProgress: 0,
        approvalProgress: 0,
        words: { total: 3, translated: 0, approved: 0 },
        phrases: { total: 2, translated: 0, approved: 0 },
        lastActivityAt: null,
      }),
    ]);
    expect(body.locales[0]?.lastActivityAt).toBeTruthy();
  });

  it("maps live provider locale readiness onto target locales", async () => {
    const admin = projectFixture.createWorkosIdentityWithRole("admin");
    const headers = await projectFixture.authHeadersFor(admin);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;
    const externalProjectId = "902809";
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId,
    });

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });

    getTmsProviderLiveProjectMock.mockResolvedValue({
      id: projectId,
      name: "Live Crowdin Project",
      targetLocales: ["vi-VN"],
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId,
    });
    getTmsProviderLiveProjectLocaleReadinessMock.mockResolvedValue({
      vi: {
        translationProgress: 14,
        approvalProgress: 0,
        words: { total: 34, translated: 5, approved: 0 },
        phrases: { total: 8, translated: 1, approved: 0 },
      },
    });

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "locale-progress"
    ].$get(
      {
        param: {
          organizationSlug: admin.organization.slug ?? "missing-slug",
          projectId,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectLocaleProgressResponse;
    expect(body.locales).toEqual([
      {
        locale: "vi-VN",
        translationProgress: 14,
        approvalProgress: 0,
        words: { total: 34, translated: 5, approved: 0 },
        phrases: { total: 8, translated: 1, approved: 0 },
        lastActivityAt: null,
      },
    ]);
  });
});
