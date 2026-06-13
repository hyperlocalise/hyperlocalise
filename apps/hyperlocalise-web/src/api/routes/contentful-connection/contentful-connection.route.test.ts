import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ContentfulSpaceDiscovery } from "@/lib/contentful/types";

const mocks = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  discoverContentfulSpaceMock: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/contentful/discover-contentful-space", () => ({
  discoverContentfulSpace: mocks.discoverContentfulSpaceMock,
}));

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database";
import { err, ok } from "@/lib/primitives/result/results";

const client = testClient(createApp());
const fixture = createAuthTestFixture();

const successfulDiscovery: ContentfulSpaceDiscovery = {
  environmentId: "master",
  locales: [
    { code: "en-US", name: "English", default: true },
    { code: "fr-FR", name: "French", default: false },
  ],
  contentTypes: [
    { id: "article", name: "Article" },
    { id: "landingPage", name: "Landing Page" },
  ],
};

describe("contentfulConnectionRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    mocks.discoverContentfulSpaceMock.mockResolvedValue(ok(successfulDiscovery));
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("discovers Contentful space metadata with an inline token", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId ?? "";

    const response = await client.api.orgs[":organizationSlug"][
      "contentful-connections"
    ].discover.$post(
      {
        param: { organizationSlug },
        json: {
          spaceId: " space-id ",
          accessToken: " cma_test_token ",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      contentfulSpaceDiscovery: successfulDiscovery,
    });
    expect(mocks.discoverContentfulSpaceMock).toHaveBeenCalledWith({
      organizationId,
      spaceId: "space-id",
      environmentId: "master",
      accessToken: "cma_test_token",
      connectionId: undefined,
    });
  });

  it("rejects discovery payloads without credentials before calling Contentful", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"][
      "contentful-connections"
    ].discover.$post(
      {
        param: { organizationSlug },
        json: {
          spaceId: "space-id",
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_contentful_discovery_payload",
    });
    expect(mocks.discoverContentfulSpaceMock).not.toHaveBeenCalled();
  });

  it("denies discovery for members without integration read access", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"][
      "contentful-connections"
    ].discover.$post(
      {
        param: { organizationSlug },
        json: {
          spaceId: "space-id",
          accessToken: "cma_test_token",
        },
      },
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "forbidden",
    });
    expect(mocks.discoverContentfulSpaceMock).not.toHaveBeenCalled();
  });

  it("maps stored-connection discovery misses to not found responses", async () => {
    mocks.discoverContentfulSpaceMock.mockResolvedValue(
      err({
        code: "contentful_discovery_connection_not_found",
        message: "Contentful connection not found.",
      }),
    );
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const connectionId = crypto.randomUUID();

    const response = await client.api.orgs[":organizationSlug"][
      "contentful-connections"
    ].discover.$post(
      {
        param: { organizationSlug },
        json: {
          spaceId: "space-id",
          connectionId,
        },
      },
      { headers },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "contentful_discovery_connection_not_found",
      message: "Contentful connection not found.",
    });
  });

  it("maps invalid Contentful credentials to unauthorized responses", async () => {
    mocks.discoverContentfulSpaceMock.mockResolvedValue(
      err({
        code: "contentful_discovery_invalid_credentials",
        message: "Contentful rejected the Management API token.",
        contentfulStatus: 401,
      }),
    );
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"][
      "contentful-connections"
    ].discover.$post(
      {
        param: { organizationSlug },
        json: {
          spaceId: "space-id",
          accessToken: "cma_test_token",
        },
      },
      { headers },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "contentful_discovery_invalid_credentials",
      message: "Contentful rejected the Management API token.",
    });
  });

  it("includes Contentful status details for unexpected discovery failures", async () => {
    mocks.discoverContentfulSpaceMock.mockResolvedValue(
      err({
        code: "contentful_discovery_request_failed",
        message: "Contentful request failed.",
        contentfulStatus: 429,
      }),
    );
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"][
      "contentful-connections"
    ].discover.$post(
      {
        param: { organizationSlug },
        json: {
          spaceId: "space-id",
          accessToken: "cma_test_token",
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "contentful_discovery_request_failed",
      message: "Contentful request failed.",
      details: {
        contentfulStatus: 429,
      },
    });
  });
});
