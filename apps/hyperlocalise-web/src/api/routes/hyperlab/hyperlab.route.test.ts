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

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  workspaceHyperlabFlagRunMock: vi.fn(async () => true),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/flags/workspace-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workspace-flags")>();
  return {
    ...actual,
    workspaceHyperlabFlag: { run: mocks.workspaceHyperlabFlagRunMock },
  };
});

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { hashExperimentClientKey } from "@/lib/experiments/client-keys";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

function hyperlab(organizationSlug: string) {
  return client.api.orgs[":organizationSlug"].hyperlab;
}

async function getOrganizationId(workosOrganizationId: string) {
  const [organization] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.workosOrganizationId, workosOrganizationId))
    .limit(1);
  if (!organization) {
    throw new Error("expected test organization");
  }
  return organization.id;
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  mocks.workspaceHyperlabFlagRunMock.mockResolvedValue(true);
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("hyperlabRoutes", () => {
  it("creates a flag that is unique per organization and hidden from other orgs", async () => {
    const identity = fixture.createWorkosIdentity();
    const other = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);
    const otherHeaders = await fixture.authHeadersFor(other);
    const slug = identity.organization.slug ?? "missing-slug";
    const otherSlug = other.organization.slug ?? "missing-slug";

    const created = await hyperlab(slug).flags.$post(
      { param: { organizationSlug: slug }, json: { key: "checkout-cta", kind: "experiment" } },
      { headers },
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { flag: { id: string; key: string } };
    expect(createdBody.flag.key).toBe("checkout-cta");

    const duplicate = await hyperlab(slug).flags.$post(
      { param: { organizationSlug: slug }, json: { key: "checkout-cta" } },
      { headers },
    );
    expect(duplicate.status).toBe(409);

    const otherCopy = await hyperlab(otherSlug).flags.$post(
      { param: { organizationSlug: otherSlug }, json: { key: "checkout-cta" } },
      { headers: otherHeaders },
    );
    expect(otherCopy.status).toBe(201);

    const foreign = await hyperlab(otherSlug).flags[":flagId"].$get(
      { param: { organizationSlug: otherSlug, flagId: createdBody.flag.id } },
      { headers: otherHeaders },
    );
    expect(foreign.status).toBe(404);
  });

  it("returns the client key secret once and stores only the hash", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);
    const slug = identity.organization.slug ?? "missing-slug";

    const created = await hyperlab(slug).keys.$post(
      { param: { organizationSlug: slug }, json: { name: "Browser" } },
      { headers },
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      key: { id: string; secret: string; keyPrefix: string };
    };
    expect(createdBody.key.secret).toMatch(/^hlk_/);
    expect(createdBody.key.keyPrefix).toBe(createdBody.key.secret.slice(0, 8));

    const listed = await hyperlab(slug).keys.$get({ param: { organizationSlug: slug } }, { headers });
    const listedBody = (await listed.json()) as { keys: Array<{ id: string; secret?: string }> };
    const listedKey = listedBody.keys.find((key) => key.id === createdBody.key.id);
    expect(listedKey).toBeDefined();
    expect(listedKey).not.toHaveProperty("secret");

    const organizationId = await getOrganizationId(identity.organization.workosOrganizationId);
    const [row] = await db
      .select({ keyHash: schema.experimentClientKeys.keyHash })
      .from(schema.experimentClientKeys)
      .where(eq(schema.experimentClientKeys.id, createdBody.key.id))
      .limit(1);
    expect(row?.keyHash).toBe(hashExperimentClientKey(createdBody.key.secret));
    expect(row?.keyHash).not.toBe(createdBody.key.secret);
    expect(organizationId).toBeTruthy();
  });

  it("forbids members from writing flags", async () => {
    const admin = fixture.createWorkosIdentity();
    const member = fixture.createWorkosIdentityForOrganization(admin.organization, "member");
    const memberHeaders = await fixture.authHeadersFor(member);
    const slug = admin.organization.slug ?? "missing-slug";

    const response = await hyperlab(slug).flags.$post(
      { param: { organizationSlug: slug }, json: { key: "blocked-flag" } },
      { headers: memberHeaders },
    );
    expect(response.status).toBe(403);
  });

  it("rejects evaluate admin routes when the WorkOS flag is off", async () => {
    mocks.workspaceHyperlabFlagRunMock.mockResolvedValue(false);
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);
    const slug = identity.organization.slug ?? "missing-slug";

    const response = await hyperlab(slug).flags.$get(
      { param: { organizationSlug: slug } },
      { headers },
    );
    expect(response.status).toBe(403);
  });
});
