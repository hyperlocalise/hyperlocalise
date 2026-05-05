import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(() => globalThis.__testApiAuthContext ?? null),
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

const client = testClient(app);
const fixture = createProjectTestFixture(client);

describe("agentEmailRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    await fixture.cleanup();
  });

  it("returns disabled state when email agent is not enabled", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["agent-email"].$get(
      {
        param: { organizationSlug },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      emailAgent: {
        enabled: false,
        inboundEmailAddress: null,
      },
    });
  });

  it("generates and stores an inbound email alias on first enable", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const headers = await fixture.authHeadersFor(identity);

    const enableResponse = await client.api.orgs[":organizationSlug"]["agent-email"].$patch(
      {
        param: { organizationSlug },
        json: { enabled: true },
      },
      { headers },
    );

    expect(enableResponse.status).toBe(200);
    const enableBody = await enableResponse.json();
    if (!("emailAgent" in enableBody)) {
      throw new Error("Expected email agent response");
    }

    expect(enableBody.emailAgent.enabled).toBe(true);
    expect(enableBody.emailAgent.inboundEmailAddress).toMatch(
      /^example-org-[a-f0-9-]+-[a-f0-9]{6}@inbox\.hyperlocalise\.com$/,
    );

    const authContext = globalThis.__testApiAuthContext;
    const [connector] = await db
      .select({
        enabled: schema.connectors.enabled,
        config: schema.connectors.config,
      })
      .from(schema.connectors)
      .where(
        and(
          eq(schema.connectors.organizationId, authContext?.organization.localOrganizationId ?? ""),
          eq(schema.connectors.kind, "email"),
        ),
      )
      .limit(1);

    expect(connector?.enabled).toBe(true);
    expect((connector?.config as { inboundEmailAlias?: string })?.inboundEmailAlias).toMatch(
      /^example-org-[a-f0-9-]+-[a-f0-9]{6}$/,
    );

    const disableResponse = await client.api.orgs[":organizationSlug"]["agent-email"].$patch(
      {
        param: { organizationSlug },
        json: { enabled: false },
      },
      { headers },
    );

    expect(disableResponse.status).toBe(200);

    const reenableResponse = await client.api.orgs[":organizationSlug"]["agent-email"].$patch(
      {
        param: { organizationSlug },
        json: { enabled: true },
      },
      { headers },
    );

    const reenableBody = await reenableResponse.json();
    if (!("emailAgent" in reenableBody)) {
      throw new Error("Expected email agent response");
    }

    expect(reenableBody.emailAgent.inboundEmailAddress).toBe(
      enableBody.emailAgent.inboundEmailAddress,
    );
  });

  it("blocks org members from updating the email agent", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["agent-email"].$patch(
      {
        param: { organizationSlug },
        json: { enabled: true },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "forbidden",
    });
  });
});
