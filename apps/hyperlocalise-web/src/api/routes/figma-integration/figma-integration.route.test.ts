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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  startFigmaLocalizationMock: vi.fn(),
  getFigmaLocalizationStatusMock: vi.fn(),
  generateFigmaLocalizationMock: vi.fn(),
  pullLatestFigmaTranslationsMock: vi.fn(),
  listOrganizationProjectsMock: vi.fn(),
  resolveApiAuthContextFromSessionMock: vi.fn(),
  authenticateSealedWorkosSessionMock: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/figma/localize-file", () => ({
  startFigmaLocalization: mocks.startFigmaLocalizationMock,
  getFigmaLocalizationStatus: mocks.getFigmaLocalizationStatusMock,
  generateFigmaLocalization: mocks.generateFigmaLocalizationMock,
  pullLatestFigmaTranslations: mocks.pullLatestFigmaTranslationsMock,
}));

vi.mock("@/lib/projects/organization/organization-project-service", () => ({
  listOrganizationProjects: mocks.listOrganizationProjectsMock,
}));

vi.mock("@/lib/workos/sealed-session", () => ({
  authenticateSealedWorkosSession: mocks.authenticateSealedWorkosSessionMock,
}));

import { createApp } from "@/api/app";
import type { ApiAuthContext } from "@/api/auth/workos";

const client = testClient(createApp());

const authContext = {
  user: {
    workosUserId: "user_workos",
    localUserId: "user_local",
    email: "dev@example.com",
  },
  organizations: [
    {
      workosOrganizationId: "org_workos",
      localOrganizationId: "org_local",
      name: "Acme",
      slug: "acme",
      membership: {
        workosMembershipId: "mem_1",
        role: "admin",
        accessSource: "workos_authoritative",
      },
    },
  ],
  organization: {
    workosOrganizationId: "org_workos",
    localOrganizationId: "org_local",
    name: "Acme",
    slug: "acme",
    membership: {
      workosMembershipId: "mem_1",
      role: "admin",
      accessSource: "workos_authoritative",
    },
  },
  activeOrganization: {
    workosOrganizationId: "org_workos",
    localOrganizationId: "org_local",
    name: "Acme",
    slug: "acme",
    membership: {
      workosMembershipId: "mem_1",
      role: "admin",
      accessSource: "workos_authoritative",
    },
  },
  membership: { workosMembershipId: "mem_1", role: "admin", accessSource: "workos_authoritative" },
  activeTeam: null,
  capabilities: [],
} as unknown as ApiAuthContext;

const sessionHeaders = {
  headers: {
    "X-Hyperlocalise-Figma-Session": "sealed.session.value",
    "X-Hyperlocalise-Organization-Slug": "acme",
  },
};

const verifiedSession = {
  user: {
    id: "user_workos",
    email: "dev@example.com",
    firstName: null,
    lastName: null,
    profilePictureUrl: null,
  },
  organizationId: "org_workos",
};

describe("figmaIntegrationRoutes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns health without auth", async () => {
    const response = await client.api.integrations.figma.health.$get();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects session requests without a Figma session header", async () => {
    const response = await client.api.integrations.figma.session.$get();
    expect(response.status).toBe(401);
    expect(mocks.authenticateSealedWorkosSessionMock).not.toHaveBeenCalled();
  });

  it("rejects a sealed session that WorkOS cannot verify", async () => {
    mocks.authenticateSealedWorkosSessionMock.mockResolvedValue(null);

    const response = await client.api.integrations.figma.session.$get(undefined, sessionHeaders);
    expect(response.status).toBe(401);
    expect(mocks.resolveApiAuthContextFromSessionMock).not.toHaveBeenCalled();
  });

  it("returns the signed-in session and projects", async () => {
    mocks.authenticateSealedWorkosSessionMock.mockResolvedValue(verifiedSession);
    mocks.resolveApiAuthContextFromSessionMock.mockResolvedValue(authContext);
    mocks.listOrganizationProjectsMock.mockResolvedValue([
      {
        id: "proj_1",
        name: "Marketing",
        sourceLocale: "en",
        targetLocales: ["es", "fr"],
      },
    ]);

    const sessionResponse = await client.api.integrations.figma.session.$get(
      undefined,
      sessionHeaders,
    );
    expect(sessionResponse.status).toBe(200);
    await expect(sessionResponse.json()).resolves.toMatchObject({
      session: {
        user: { email: "dev@example.com" },
        organization: { slug: "acme" },
      },
    });
    expect(mocks.authenticateSealedWorkosSessionMock).toHaveBeenCalledWith("sealed.session.value");
    expect(mocks.resolveApiAuthContextFromSessionMock).toHaveBeenCalledWith({
      session: verifiedSession,
      organizationSlug: "acme",
    });

    const projectsResponse = await client.api.integrations.figma.projects.$get(
      undefined,
      sessionHeaders,
    );
    expect(projectsResponse.status).toBe(200);
    await expect(projectsResponse.json()).resolves.toEqual({
      projects: [
        {
          id: "proj_1",
          name: "Marketing",
          sourceLocale: "en",
          targetLocales: ["es", "fr"],
        },
      ],
    });
  });

  it("creates a job from extracted Figma segments", async () => {
    mocks.authenticateSealedWorkosSessionMock.mockResolvedValue(verifiedSession);
    mocks.resolveApiAuthContextFromSessionMock.mockResolvedValue(authContext);
    mocks.startFigmaLocalizationMock.mockResolvedValue({
      jobId: "job_figma",
      generated: true,
    });

    const response = await client.api.integrations.figma.jobs.$post(
      {
        json: {
          projectId: "proj_1",
          fileKey: "fileKey123",
          pageId: "12:34",
          sourceLocale: "en",
          targetLocales: ["es"],
          generate: true,
          segments: [
            {
              key: "figma.segment.1:1.0",
              nodeId: "1:1",
              regionIndex: 0,
              text: "Hello",
            },
          ],
        },
      },
      sessionHeaders,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      job: { jobId: "job_figma", generated: true },
    });
    expect(mocks.startFigmaLocalizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj_1",
        fileKey: "fileKey123",
        pageId: "12:34",
        generate: true,
      }),
    );
  });

  it("polls job status and pulls latest translations", async () => {
    mocks.authenticateSealedWorkosSessionMock.mockResolvedValue(verifiedSession);
    mocks.resolveApiAuthContextFromSessionMock.mockResolvedValue(authContext);
    mocks.getFigmaLocalizationStatusMock.mockResolvedValue({
      jobId: "job_figma",
      status: "succeeded",
      translationsByLocale: { es: { "figma.segment.1:1.0": "Hola" } },
    });
    mocks.generateFigmaLocalizationMock.mockResolvedValue({ jobId: "job_figma" });
    mocks.pullLatestFigmaTranslationsMock.mockResolvedValue({
      jobId: "job_figma",
      status: "succeeded",
      translationsByLocale: { es: { "figma.segment.1:1.0": "Hola" } },
    });

    const statusResponse = await client.api.integrations.figma.jobs[":jobId"].$get(
      { param: { jobId: "job_figma" } },
      sessionHeaders,
    );
    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toMatchObject({
      job: { status: "succeeded" },
    });

    const generateResponse = await client.api.integrations.figma.jobs[":jobId"].generate.$post(
      { param: { jobId: "job_figma" } },
      sessionHeaders,
    );
    expect(generateResponse.status).toBe(202);

    const pullResponse = await client.api.integrations.figma.translations.$get(
      { query: { projectId: "proj_1", fileKey: "fileKey123", pageId: "12:34" } },
      sessionHeaders,
    );
    expect(pullResponse.status).toBe(200);
    await expect(pullResponse.json()).resolves.toMatchObject({
      translations: { status: "succeeded" },
    });
    expect(mocks.pullLatestFigmaTranslationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj_1",
        fileKey: "fileKey123",
        pageId: "12:34",
      }),
    );
  });
});
