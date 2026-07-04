import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  startCanvaLocalizationMock: vi.fn(),
  getCanvaLocalizationStatusMock: vi.fn(),
  resolveCanvaDesignIdMock: vi.fn(async () => "design-id"),
  verifyCanvaUserTokenMock: vi.fn(async () => ({
    userId: "canva-user",
    brandId: "canva-brand",
  })),
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
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/canva/localize-design", () => ({
  startCanvaLocalization: mocks.startCanvaLocalizationMock,
  getCanvaLocalizationStatus: mocks.getCanvaLocalizationStatusMock,
}));

vi.mock("@/lib/canva/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/canva/auth")>();
  return {
    ...actual,
    verifyCanvaUserToken: mocks.verifyCanvaUserTokenMock,
    resolveCanvaDesignId: mocks.resolveCanvaDesignIdMock,
  };
});

import { createApp } from "@/api/app";
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { cleanupCanvaOAuthTestSessions, createCanvaOAuthTestSession } from "./canva-oauth.fixture";

const client = testClient(createApp());
const projectFixture = createProjectTestFixture(client);

describe("canvaIntegrationRoutes", () => {
  const cleanedUserIds: string[] = [];

  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await cleanupCanvaOAuthTestSessions(cleanedUserIds);
    cleanedUserIds.length = 0;
    await projectFixture.cleanup();
  });

  async function createOAuthContext() {
    const stored = await projectFixture.createStoredProjectFixture();
    await projectFixture.authHeadersFor(stored.identity);
    const auth = globalThis.__testApiAuthContext!;

    const oauth = await createCanvaOAuthTestSession({
      userId: stored.user.id,
    });
    cleanedUserIds.push(stored.user.id);

    return {
      stored,
      auth,
      oauth,
      headers: {
        Authorization: `Bearer ${oauth.accessToken}`,
        "X-Canva-User-Token": "design-token",
      },
    };
  }

  it("starts localization when the OAuth access token is valid", async () => {
    const { stored, auth, oauth, headers } = await createOAuthContext();
    const organizationId = stored.organization.id;
    const projectId = stored.project.id;

    mocks.startCanvaLocalizationMock.mockResolvedValue({
      jobId: "job_test",
    });

    const response = await client.api.integrations.canva.localize.$post(
      {
        json: {
          organizationId,
          projectId,
          designToken: "design-token",
          sourceLocale: "en",
          targetLocales: ["es"],
          segments: [
            {
              key: "canva.segment.0.0.0",
              pageIndex: 0,
              contentIndex: 0,
              regionIndex: 0,
              text: "Hello",
            },
          ],
        },
      },
      { headers },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      jobId: "job_test",
      mode: "hyperlocalise",
    });
    expect(mocks.startCanvaLocalizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        projectId,
        session: expect.objectContaining({
          sessionId: oauth.sessionId,
          user: expect.objectContaining({
            localUserId: auth.user.localUserId,
          }),
        }),
      }),
    );
  });

  it("does not store a brand-org binding when localization authorization fails", async () => {
    const { stored, headers } = await createOAuthContext();

    mocks.startCanvaLocalizationMock.mockRejectedValue(new Error("canva_project_not_found"));

    const response = await client.api.integrations.canva.localize.$post(
      {
        json: {
          organizationId: stored.organization.id,
          projectId: stored.project.id,
          designToken: "design-token",
          sourceLocale: "en",
          targetLocales: ["es"],
          rememberBrandOrgBinding: true,
          segments: [
            {
              key: "canva.segment.0.0.0",
              pageIndex: 0,
              contentIndex: 0,
              regionIndex: 0,
              text: "Hello",
            },
          ],
        },
      },
      { headers },
    );

    expect(response.status).toBe(502);

    const bindings = await db
      .select({ id: schema.canvaBrandOrgBindings.id })
      .from(schema.canvaBrandOrgBindings)
      .where(eq(schema.canvaBrandOrgBindings.canvaBrandId, "canva-brand"));

    expect(bindings).toHaveLength(0);
  });

  it("returns localization results for a completed job", async () => {
    const { stored, auth, headers } = await createOAuthContext();
    const organizationId = stored.organization.id;
    const projectId = stored.project.id;

    mocks.getCanvaLocalizationStatusMock.mockResolvedValue({
      jobId: "job_test",
      status: "succeeded",
      translationsByLocale: {
        es: {
          "canva.segment.0.0.0": "Hola",
        },
      },
    });

    const response = await client.api.integrations.canva.localize[":jobId"].$get(
      {
        param: {
          jobId: "job_test",
        },
        query: {
          organizationId,
          projectId,
        } as { organizationId: string; projectId: string },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId: "job_test",
      status: "succeeded",
      translationsByLocale: {
        es: {
          "canva.segment.0.0.0": "Hola",
        },
      },
      mode: "hyperlocalise",
    });
    expect(mocks.getCanvaLocalizationStatusMock).toHaveBeenCalledWith({
      jobId: "job_test",
      organizationId,
      userId: auth.user.localUserId,
      projectId,
    });
  });

  it("rejects localize requests without an OAuth access token", async () => {
    const response = await client.api.integrations.canva.localize.$post({
      json: {
        organizationId: "00000000-0000-4000-8000-000000000001",
        projectId: "prj_test",
        designToken: "design-token",
        sourceLocale: "en",
        targetLocales: ["es"],
        segments: [
          {
            key: "canva.segment.0.0.0",
            pageIndex: 0,
            contentIndex: 0,
            regionIndex: 0,
            text: "Hello",
          },
        ],
      },
    });

    expect(response.status).toBe(401);
  });
});
