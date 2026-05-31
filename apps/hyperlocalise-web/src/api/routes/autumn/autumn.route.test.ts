import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

const { autumnHandlerMock, autumnRequestHandlerMock } = vi.hoisted(() => {
  const autumnRequestHandlerMock = vi.fn(
    async (
      _c: { get: (key: string) => unknown },
      identity: {
        customerId?: string;
        customerData?: { name?: string; email?: string };
      } | null,
    ) =>
      new Response(JSON.stringify({ identity }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );

  const autumnHandlerMock = vi.fn(
    ({
      identify,
    }: {
      identify: (c: { get: (key: string) => unknown }) => {
        customerId?: string;
        customerData?: { name?: string; email?: string };
      } | null;
    }) => {
      return async (c: { get: (key: string) => unknown }) => {
        const identity = identify(c);
        return autumnRequestHandlerMock(c, identity);
      };
    },
  );

  return { autumnHandlerMock, autumnRequestHandlerMock };
});

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("autumn-js/hono", () => ({
  autumnHandler: autumnHandlerMock,
}));

import { createApp } from "@/api/app";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { ORGANIZATION_SLUG_HEADER } from "@/lib/billing/autumn-public-config";
import { LOCAL_ORG_WORKOS_ID_PREFIX } from "@/lib/billing/autumn-customer";
import { db } from "@/lib/database";

const app = createApp();
const fixture = createAuthTestFixture();

async function postAutumnRoute(routeName: string, headers: Record<string, string> = {}) {
  return app.request(`http://localhost/api/autumn/${routeName}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({}),
  });
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  resolveApiAuthContextFromSessionMock.mockClear();
  autumnRequestHandlerMock.mockClear();
  await fixture.cleanup();
});

describe("autumnRoutes", () => {
  it("returns unauthorized without a session cookie", async () => {
    const response = await postAutumnRoute("getOrCreateCustomer", {
      [ORGANIZATION_SLUG_HEADER]: "missing-org",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "unauthorized",
    });
  });

  it("forbids billing routes for members without billing access", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await postAutumnRoute("openCustomerPortal", {
      cookie: headers.cookie,
      [ORGANIZATION_SLUG_HEADER]: identity.organization.slug ?? "missing-slug",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "billing_read_forbidden",
    });
    expect(autumnRequestHandlerMock).not.toHaveBeenCalled();
  });

  it("allows admins to reach Autumn write routes", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await postAutumnRoute("openCustomerPortal", {
      cookie: headers.cookie,
      [ORGANIZATION_SLUG_HEADER]: identity.organization.slug ?? "missing-slug",
    });

    expect(response.status).toBe(200);
    expect(autumnRequestHandlerMock).toHaveBeenCalledTimes(1);
  });

  it("forbids deprecated local_org workspaces before Autumn is invoked", async () => {
    const identity = fixture.createWorkosIdentity();
    identity.organization.workosOrganizationId = `${LOCAL_ORG_WORKOS_ID_PREFIX}legacy`;
    const headers = await fixture.authHeadersFor(identity);

    const response = await postAutumnRoute("getOrCreateCustomer", {
      cookie: headers.cookie,
      [ORGANIZATION_SLUG_HEADER]: identity.organization.slug ?? "missing-slug",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "billing_customer_unavailable",
    });
    expect(autumnRequestHandlerMock).not.toHaveBeenCalled();
  });

  it("scopes Autumn identity to the active organization from the slug header", async () => {
    const primaryIdentity = fixture.createWorkosIdentity();
    const secondaryIdentity = {
      ...fixture.createWorkosIdentityForOrganization(
        {
          workosOrganizationId: `org_${crypto.randomUUID()}`,
          name: "Secondary Workspace",
          slug: `secondary-${crypto.randomUUID()}`,
        },
        "admin",
      ),
      user: primaryIdentity.user,
      membership: {
        workosMembershipId: `${primaryIdentity.membership.workosMembershipId}-secondary`,
        role: "admin",
      },
    } satisfies WorkosAuthIdentity;

    const { cookie, organizations } = await fixture.authHeadersForOrganizations([
      primaryIdentity,
      secondaryIdentity,
    ]);
    const secondaryOrganization = organizations[1]!;

    const response = await postAutumnRoute("getOrCreateCustomer", {
      cookie,
      [ORGANIZATION_SLUG_HEADER]: secondaryOrganization.slug ?? "missing-slug",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      identity: {
        customerId: secondaryOrganization.localOrganizationId,
        customerData: {
          name: "Secondary Workspace",
        },
      },
    });
  });
});
