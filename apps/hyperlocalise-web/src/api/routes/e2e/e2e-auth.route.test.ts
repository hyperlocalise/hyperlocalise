import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { testClient } from "hono/testing";

import { E2E_SETUP_TOKEN_HEADER } from "@/lib/e2e/config";
import { db, schema } from "@/lib/database";

const fixtureAuthState = vi.hoisted(() => ({
  enabled: true,
  tokenValid: true,
}));

vi.mock("@/lib/e2e/config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/e2e/config")>("@/lib/e2e/config");

  return {
    ...actual,
    isFixtureAuthEnabled: () => fixtureAuthState.enabled,
    verifyE2eSetupToken: (token: string | null | undefined) =>
      fixtureAuthState.tokenValid && token === "test-token",
  };
});

function parseSessionCookie(setCookieHeader: string | null) {
  const match = setCookieHeader?.match(/wos-session=([^;]+)/);
  return match?.[1] ?? null;
}

describe("e2e auth route", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    fixtureAuthState.enabled = true;
    fixtureAuthState.tokenValid = true;
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
      header: {
        [E2E_SETUP_TOKEN_HEADER]: "test-token",
      },
    });

    expect(response.status).toBe(404);
  });

  it("returns 404 when the setup token is invalid", async () => {
    fixtureAuthState.tokenValid = false;
    const { createE2eAuthRoutes } = await import("./e2e-auth.route");
    const client = testClient(createE2eAuthRoutes());

    const response = await client.auth.session.$post({
      json: { role: "admin" },
      header: {
        [E2E_SETUP_TOKEN_HEADER]: "invalid-token",
      },
    });

    expect(response.status).toBe(404);
  });

  it("creates a fixture session and sets the auth cookie", async () => {
    const { createE2eAuthRoutes } = await import("./e2e-auth.route");
    const client = testClient(createE2eAuthRoutes());

    const response = await client.auth.session.$post({
      json: { role: "admin" },
      header: {
        [E2E_SETUP_TOKEN_HEADER]: "test-token",
      },
    });

    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      session: {
        email: string;
        organizationSlug: string;
        workosOrganizationId: string;
        workosUserId: string;
        sessionToken?: string;
      };
    };
    expect(body.session.organizationSlug).toMatch(/^example-org-/);
    expect(body.session.sessionToken).toBeUndefined();
    expect(parseSessionCookie(response.headers.get("set-cookie"))).toMatch(/^test_/);
  });

  it("returns 400 for an invalid request body", async () => {
    const { createE2eAuthRoutes } = await import("./e2e-auth.route");
    const client = testClient(createE2eAuthRoutes());

    const response = await client.auth.session.$post({
      json: { role: "godmode" },
      header: {
        [E2E_SETUP_TOKEN_HEADER]: "test-token",
      },
    });

    expect(response.status).toBe(400);

    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("creates an onboarding fixture session without an organization", async () => {
    const { createE2eAuthRoutes } = await import("./e2e-auth.route");
    const client = testClient(createE2eAuthRoutes());

    const response = await client.auth.session.$post({
      json: { mode: "onboarding" },
      header: {
        [E2E_SETUP_TOKEN_HEADER]: "test-token",
      },
    });

    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      session: {
        email: string;
        workosUserId: string;
        sessionToken?: string;
      };
    };
    expect(body.session.sessionToken).toBeUndefined();
    expect(body.session.workosUserId).toMatch(/^user_/);
    expect(parseSessionCookie(response.headers.get("set-cookie"))).toMatch(/^test_/);
  });

  it("deletes the current fixture session and its database records", async () => {
    const { createE2eAuthRoutes } = await import("./e2e-auth.route");
    const { getFixtureSessionRecord } = await import("@/lib/e2e/fixture-auth");
    const client = testClient(createE2eAuthRoutes());

    const createResponse = await client.auth.session.$post({
      json: { role: "admin" },
      header: {
        [E2E_SETUP_TOKEN_HEADER]: "test-token",
      },
    });
    const body = await createResponse.json();
    const sessionToken = parseSessionCookie(createResponse.headers.get("set-cookie"));
    if (
      !sessionToken ||
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
          [E2E_SETUP_TOKEN_HEADER]: "test-token",
          cookie: `wos-session=${sessionToken}`,
        },
      },
    );

    expect(deleteResponse.status).toBe(204);
    expect(deleteResponse.body).toBeNull();
    expect(deleteResponse.headers.get("set-cookie")).toContain("wos-session=;");
    expect(getFixtureSessionRecord(sessionToken)).toBeNull();

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
          [E2E_SETUP_TOKEN_HEADER]: "test-token",
          cookie: "wos-session=test_unknown",
        },
      },
    );

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it("returns 404 when deleting without a valid setup token", async () => {
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

    expect(response.status).toBe(404);
  });
});
