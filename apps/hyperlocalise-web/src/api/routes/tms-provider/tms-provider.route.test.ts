import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { app } from "@/api/app";
import {
  getActiveOrganizationExternalTmsProviderCredential,
  upsertOrganizationExternalTmsProviderCredential,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import * as tmsProviderLive from "@/lib/providers/tms-provider-live";
import { createProviderCredentialTestFixture } from "../provider-credential/provider-credential.fixture";

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

const client = testClient(app);
const fixture = createProviderCredentialTestFixture(client);

describe("tmsProviderRoutes", () => {
  beforeAll(async () => {
    await import("@/lib/database").then(({ db }) => db.$client.query("select 1"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    await fixture.cleanup();
  });

  it("returns 404 when no active TMS provider is connected", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["tms-provider"].connection.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
      },
      { headers },
    );

    expect(response.status).toBe(404);
  });

  it("returns live projects for the active provider", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId: globalThis.__testApiAuthContext!.user.localUserId,
      role: "admin",
      providerKind: "phrase",
      displayName: "Phrase",
      secretMaterial: "phrase-secret",
      region: "us",
    });

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId: globalThis.__testApiAuthContext!.user.localUserId,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });

    const active = await getActiveOrganizationExternalTmsProviderCredential(organizationId);
    expect(active?.providerKind).toBe("crowdin");

    const listProjects = vi
      .spyOn(tmsProviderLive, "listTmsProviderLiveProjects")
      .mockResolvedValue([
        {
          id: "ext:crowdin:42",
          name: "Marketing",
          description: null,
          translationContext: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: "external_tms",
          externalProviderKind: "crowdin",
          externalProjectId: "42",
          sourceLocale: "en",
          targetLocales: ["fr"],
          externalProjectUrl: "https://crowdin.com/project/42",
          isActive: true,
          openJobCount: 0,
        },
      ]);

    const response = await client.api.orgs[":organizationSlug"]["tms-provider"].projects.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { projects: unknown[] };
    expect(body.projects).toHaveLength(1);
    expect(listProjects).toHaveBeenCalledWith(organizationId);
  });
});
