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

import { app } from "@/api/app";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import type { AppType } from "@/api/typed-app";
import { db } from "@/lib/database/client";
import { setCdnDestinationProbeForTests } from "@/lib/ota/destinations";

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
  return { ...actual, resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock };
});

const client = testClient<AppType>(app);
const fixture = createAuthTestFixture();
const destinations = client.api.orgs[":organizationSlug"]["cdn-destinations"];

const ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE";
const SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

function param(identity: WorkosAuthIdentity) {
  return { organizationSlug: identity.organization.slug ?? "missing-slug" };
}

async function headers(identity: WorkosAuthIdentity) {
  return { headers: await fixture.authHeadersFor(identity) };
}

describe("cdnDestinationRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    setCdnDestinationProbeForTests(null);
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("creates, lists without secrets, and deletes a destination after a successful probe", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    let probed = 0;
    setCdnDestinationProbeForTests(async () => {
      probed += 1;
    });

    const created = await destinations.$post(
      {
        param: param(admin),
        json: {
          name: "Customer CDN",
          bucket: "acme-ota-prod",
          region: "eu-west-1",
          publicBaseUrl: "https://cdn.acme.test",
          accessKeyId: ACCESS_KEY,
          secretAccessKey: SECRET_KEY,
        },
      },
      await headers(admin),
    );
    expect(created.status).toBe(201);
    expect(probed).toBe(1);
    const body = (await created.json()) as {
      destination: { id: string; maskedSecretSuffix: string; publicBaseUrl: string };
    };
    expect(body.destination.publicBaseUrl).toBe("https://cdn.acme.test");
    expect(body.destination.maskedSecretSuffix).toBe("••••MPLE");
    expect(JSON.stringify(body)).not.toContain(SECRET_KEY);

    const listed = await destinations.$get({ param: param(admin) }, await headers(admin));
    expect(listed.status).toBe(200);
    const list = (await listed.json()) as { destinations: Array<{ id: string }> };
    expect(list.destinations).toHaveLength(1);

    const deleted = await destinations[":destinationId"].$delete(
      { param: { ...param(admin), destinationId: body.destination.id } },
      await headers(admin),
    );
    expect(deleted.status).toBe(204);
  });

  it("rejects a private S3 endpoint", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    setCdnDestinationProbeForTests(async () => undefined);

    const response = await destinations.$post(
      {
        param: param(admin),
        json: {
          name: "Loopback",
          bucket: "acme-ota-prod",
          region: "us-east-1",
          endpoint: "https://127.0.0.1:9000",
          publicBaseUrl: "https://cdn.acme.test",
          accessKeyId: ACCESS_KEY,
          secretAccessKey: SECRET_KEY,
        },
      },
      await headers(admin),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_endpoint" });
  });
});
