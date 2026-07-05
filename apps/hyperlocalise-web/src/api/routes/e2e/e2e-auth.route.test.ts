import "dotenv/config";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { testClient } from "hono/testing";

import { db } from "@/lib/database";

const fixtureAuthState = vi.hoisted(() => ({
  enabled: true,
}));

vi.mock("@/lib/e2e/config", () => ({
  isFixtureAuthEnabled: () => fixtureAuthState.enabled,
  e2eConfig: {
    target: "local",
    baseUrl: "http://localhost:3000",
    authMode: "fixture",
  },
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
    const { clearFixtureAuthSessions } = await import("@/lib/e2e/fixture-auth");
    clearFixtureAuthSessions();
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
});
