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
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

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

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";

const client = testClient(createApp());
const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

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

async function seedGithubRepository(input: {
  organizationId: string;
  enabled?: boolean;
  archived?: boolean;
}) {
  const numericSuffix = BigInt(`0x${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`)
    .toString()
    .slice(0, 12);
  const githubInstallationId = `7${numericSuffix}`;
  const githubRepositoryId = `6${numericSuffix}`;

  await db.insert(schema.githubInstallations).values({
    organizationId: input.organizationId,
    githubInstallationId,
    githubAppId: "123",
    accountLogin: "hyperlocalise",
    accountType: "Organization",
  });

  const [repository] = await db
    .insert(schema.githubInstallationRepositories)
    .values({
      organizationId: input.organizationId,
      githubInstallationId,
      githubRepositoryId,
      owner: "hyperlocalise",
      name: `web-${numericSuffix}`,
      fullName: `hyperlocalise/web-${numericSuffix}`,
      private: false,
      archived: input.archived ?? false,
      defaultBranch: "main",
      enabled: input.enabled ?? true,
    })
    .returning();

  if (!repository) {
    throw new Error("failed to seed repository");
  }

  return repository;
}

describe("github auto-review routes", () => {
  it("reads default settings and saves selected repositories for an operator", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = await getOrganizationId(identity.organization.workosOrganizationId);
    const repository = await seedGithubRepository({ organizationId });

    const getResponse = await client.api.orgs[":organizationSlug"].automations[
      "github-auto-review"
    ].$get({ param: { organizationSlug } }, { headers });

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      autoReview: {
        enabled: false,
        additionalPrompt: "",
        githubInstallationRepositoryIds: [],
        repositories: [expect.objectContaining({ id: repository.id })],
      },
    });

    const putResponse = await client.api.orgs[":organizationSlug"].automations[
      "github-auto-review"
    ].$put(
      {
        param: { organizationSlug },
        json: {
          enabled: true,
          additionalPrompt: "Focus on ICU.",
          githubInstallationRepositoryIds: [repository.id],
        },
      },
      { headers },
    );

    expect(putResponse.status).toBe(200);
    await expect(putResponse.json()).resolves.toMatchObject({
      autoReview: {
        enabled: true,
        additionalPrompt: "Focus on ICU.",
        githubInstallationRepositoryIds: [repository.id],
      },
    });
  });

  it("denies auto-review settings for non-operators", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].automations[
      "github-auto-review"
    ].$get(
      { param: { organizationSlug: identity.organization.slug ?? "missing-slug" } },
      { headers },
    );

    expect(response.status).toBe(403);
  });

  it("rejects disabled repositories", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = await getOrganizationId(identity.organization.workosOrganizationId);
    const repository = await seedGithubRepository({ organizationId, enabled: false });

    const response = await client.api.orgs[":organizationSlug"].automations[
      "github-auto-review"
    ].$put(
      {
        param: { organizationSlug },
        json: {
          enabled: true,
          additionalPrompt: "",
          githubInstallationRepositoryIds: [repository.id],
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "github_repository_not_enabled",
    });
  });
});
