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
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
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

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

/** Bitbucket answering a working token: one readable repository, and who it belongs to. */
function bitbucketAccepts() {
  return vi.fn(async (input: string | URL, _init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/2.0/repositories") {
      return json({ values: [{ uuid: "{r1}" }] });
    }
    if (url.pathname === "/2.0/user") {
      return json({ display_name: "Dev Example", username: "dev" });
    }
    return json({}, 404);
  });
}

function connections() {
  return client.api.orgs[":organizationSlug"].bitbucket.connections;
}

describe("bitbucketRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await fixture.cleanup();
  });

  it("checks and saves a connection, never returning the token", async () => {
    const fetchMock = bitbucketAccepts();
    vi.stubGlobal("fetch", fetchMock);
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "";

    const saved = await connections().$post(
      {
        param: { organizationSlug },
        json: { name: "", accountEmail: "dev@example.com", accessToken: "ATATT-secret-1234" },
      },
      { headers },
    );

    expect(saved.status).toBe(201);
    const body = await saved.json();
    expect(body).toMatchObject({
      bitbucketConnection: {
        name: "Dev Example",
        isDefault: true,
        accountEmail: "dev@example.com",
        connectedAccount: "Dev Example",
        syncCount: 0,
      },
      check: { readsRepositories: true },
    });
    expect(JSON.stringify(body)).not.toContain("ATATT-secret-1234");
    const authorization = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(authorization.Authorization).toBe(
      `Basic ${Buffer.from("dev@example.com:ATATT-secret-1234").toString("base64")}`,
    );

    const listed = await connections().$get({ param: { organizationSlug } }, { headers });
    expect(listed.status).toBe(200);
    const list = await listed.json();
    expect("bitbucketConnections" in list && list.bitbucketConnections).toHaveLength(1);
  });

  it("saves nothing when Bitbucket refuses the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({}, 401)),
    );
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "";

    const saved = await connections().$post(
      { param: { organizationSlug }, json: { accessToken: "bad-token" } },
      { headers },
    );

    expect(saved.status).toBe(400);
    await expect(saved.json()).resolves.toMatchObject({ error: "bitbucket_token_rejected" });
    const listed = await connections().$get({ param: { organizationSlug } }, { headers });
    const list = await listed.json();
    expect("bitbucketConnections" in list && list.bitbucketConnections).toEqual([]);
  });

  it("refuses an email that isn't one", async () => {
    vi.stubGlobal("fetch", bitbucketAccepts());
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const saved = await connections().$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "" },
        json: { accountEmail: "not-an-email", accessToken: "token" },
      },
      { headers },
    );

    expect(saved.status).toBe(400);
    await expect(saved.json()).resolves.toMatchObject({ error: "bitbucket_email_invalid" });
  });

  it("marks a default, and moves it to the oldest remaining one when the default goes", async () => {
    vi.stubGlobal("fetch", bitbucketAccepts());
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "";
    const save = async (name: string) => {
      const response = await connections().$post(
        { param: { organizationSlug }, json: { name, accessToken: `token-${name}` } },
        { headers },
      );
      const body = await response.json();
      return "bitbucketConnection" in body ? body.bitbucketConnection.id : "";
    };
    const first = await save("First");
    const second = await save("Second");

    const marked = await connections()[":connectionId"].default.$post(
      { param: { organizationSlug, connectionId: second } },
      { headers },
    );
    expect(marked.status).toBe(200);
    const removed = await connections()[":connectionId"].$delete(
      { param: { organizationSlug, connectionId: second } },
      { headers },
    );
    expect(removed.status).toBe(204);

    const listed = await connections().$get({ param: { organizationSlug } }, { headers });
    const list = await listed.json();
    expect("bitbucketConnections" in list && list.bitbucketConnections).toMatchObject([
      { id: first, isDefault: true },
    ]);
  });

  it("lets a developer see connections but not change them", async () => {
    vi.stubGlobal("fetch", bitbucketAccepts());
    const identity = fixture.createWorkosIdentityWithRole("developer");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "";

    const listed = await connections().$get({ param: { organizationSlug } }, { headers });
    const saved = await connections().$post(
      { param: { organizationSlug }, json: { accessToken: "token" } },
      { headers },
    );

    expect(listed.status).toBe(200);
    expect(saved.status).toBe(403);
  });
});
