import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { testClient } from "hono/testing";

import { db, schema } from "@/lib/database";

const fixtureAuthState = vi.hoisted(() => ({
  enabled: true,
}));

vi.mock("@/lib/e2e/config", () => ({
  isFixtureAuthEnabled: () => fixtureAuthState.enabled,
  FIXTURE_SESSION_PREFIX: "test_",
  isFixtureSessionToken: (token: string | undefined | null) => Boolean(token?.startsWith("test_")),
}));

describe("e2e auth route", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    fixtureAuthState.enabled = true;
  });

  afterEach(async () => {
    const { cleanupAllFixtureAuthSessions } = await import("@/lib/e2e/fixture-auth");
    await cleanupAllFixtureAuthSessions();
  });

  it("returns 404 when fixture auth is disabled", async () => {
    fixtureAuthState.enabled = false;
    const { createE2eAuthRoutes } = await import("./e2e-auth.route");
    const client = testClient(createE2eAuthRoutes());

    const response = await client.auth.session.$post({
      json: {},
    });

    expect(response.status).toBe(404);
  });

  it("creates a fixture session and sets the auth cookie", async () => {
    const { createE2eAuthRoutes } = await import("./e2e-auth.route");
    const client = testClient(createE2eAuthRoutes());

    const response = await client.auth.session.$post({
      json: { role: "admin" },
    });

    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      session: {
        email: string;
        organizationSlug: string;
        sessionToken: string;
        workosOrganizationId: string;
        workosUserId: string;
      };
    };
    expect(body.session.organizationSlug).toMatch(/^example-org-/);
    expect(body.session.sessionToken).toMatch(/^test_/);
    expect(response.headers.get("set-cookie")).toContain("wos-session=");
  });

  it("creates an onboarding fixture session without an organization", async () => {
    const { createE2eAuthRoutes } = await import("./e2e-auth.route");
    const client = testClient(createE2eAuthRoutes());

    const response = await client.auth.session.$post({
      json: { mode: "onboarding" },
    });

    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      session: {
        email: string;
        sessionToken: string;
        workosUserId: string;
      };
    };
    expect(body.session.sessionToken).toMatch(/^test_/);
    expect(body.session.workosUserId).toMatch(/^user_/);
    expect(response.headers.get("set-cookie")).toContain("wos-session=");
  });

  it("deletes the current fixture session and its database records", async () => {
    const { createE2eAuthRoutes } = await import("./e2e-auth.route");
    const { getFixtureSessionRecord } = await import("@/lib/e2e/fixture-auth");
    const client = testClient(createE2eAuthRoutes());

    const createResponse = await client.auth.session.$post({
      json: { role: "admin" },
    });
    const body = await createResponse.json();
    if (
      !("session" in body) ||
      !("workosOrganizationId" in body.session) ||
      typeof body.session.workosOrganizationId !== "string"
    ) {
      throw new Error("Expected an organization fixture session");
    }

    const deleteResponse = await client.auth.session.$delete(
      {},
      {
        headers: {
          cookie: `wos-session=${body.session.sessionToken}`,
        },
      },
    );

    expect(deleteResponse.status).toBe(204);
    expect(deleteResponse.body).toBeNull();
    expect(deleteResponse.headers.get("set-cookie")).toContain("wos-session=;");
    expect(getFixtureSessionRecord(body.session.sessionToken)).toBeNull();

    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.workosOrganizationId, body.session.workosOrganizationId));
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, body.session.workosUserId));

    expect(organization).toBeUndefined();
    expect(user).toBeUndefined();
  });

  it("treats deleting an unknown fixture session as successful", async () => {
    const { createE2eAuthRoutes } = await import("./e2e-auth.route");
    const client = testClient(createE2eAuthRoutes());

    const response = await client.auth.session.$delete(
      {},
      {
        headers: {
          cookie: "wos-session=test_unknown",
        },
      },
    );

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });
});
