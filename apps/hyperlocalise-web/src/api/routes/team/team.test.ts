import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db } from "@/lib/database";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(() => globalThis.__testApiAuthContext ?? null),
}));

vi.mock("inngest/hono", () => ({
  serve: () => () => new Response(null, { status: 204 }),
}));

vi.mock("@/lib/inngest", () => ({
  inngest: {},
  createInngestTranslationJobQueue: () => ({
    enqueue: async () => ({ ids: [] }),
  }),
}));

vi.mock("@/lib/translation/translation-job-queued-function", () => ({
  translationJobQueuedFunction: {},
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

const client = testClient(app);
const fixture = createProjectTestFixture(client);

describe("teamRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
    await db.$client.query(`
      DO $$
      BEGIN
        CREATE TYPE team_membership_role AS ENUM ('manager', 'member');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await db.$client.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
        slug text NOT NULL,
        name text NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
    await db.$client.query(`
      CREATE TABLE IF NOT EXISTS team_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        team_id uuid NOT NULL REFERENCES teams(id) ON DELETE cascade,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
        role team_membership_role DEFAULT 'member' NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
    await db.$client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS teams_org_slug_key
      ON teams (organization_id, slug);
    `);
    await db.$client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS team_memberships_team_user_key
      ON team_memberships (team_id, user_id);
    `);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("allows an org admin to create and list teams", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await client.api.orgs[":organizationSlug"].teams.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Platform",
        },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toMatchObject({
      team: expect.objectContaining({
        name: "Platform",
        slug: "platform",
      }),
    });

    const listResponse = await client.api.orgs[":organizationSlug"].teams.$get(
      {
        param: { organizationSlug },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      teams: [expect.objectContaining({ name: "Platform", memberCount: 1 })],
    });
  });

  it("blocks org members from creating teams", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const response = await client.api.orgs[":organizationSlug"].teams.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: {
          name: "Support",
        },
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

  it("returns 409 when creating or updating a team to a duplicate slug", async () => {
    const identity = fixture.createWorkosIdentity();
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const firstCreateResponse = await client.api.orgs[":organizationSlug"].teams.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Platform",
        },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(firstCreateResponse.status).toBe(201);

    const duplicateCreateResponse = await client.api.orgs[":organizationSlug"].teams.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Platform",
        },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(duplicateCreateResponse.status).toBe(409);
    await expect(duplicateCreateResponse.json()).resolves.toEqual({
      error: "team_slug_already_exists",
    });

    const secondCreateResponse = await client.api.orgs[":organizationSlug"].teams.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Operations",
          slug: "operations",
        },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    const secondCreateBody = (await secondCreateResponse.json()) as {
      team: {
        id: string;
      };
    };

    const duplicatePatchResponse = await client.api.orgs[":organizationSlug"].teams[
      ":teamId"
    ].$patch(
      {
        param: { organizationSlug, teamId: secondCreateBody.team.id },
        json: {
          slug: "platform",
        },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(duplicatePatchResponse.status).toBe(409);
    await expect(duplicatePatchResponse.json()).resolves.toEqual({
      error: "team_slug_already_exists",
    });
  });

  it("allows admins to update teams", async () => {
    const identity = fixture.createWorkosIdentity();
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await client.api.orgs[":organizationSlug"].teams.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Platform",
        },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    const createBody = (await createResponse.json()) as {
      team: {
        id: string;
      };
    };

    const patchResponse = await client.api.orgs[":organizationSlug"].teams[":teamId"].$patch(
      {
        param: { organizationSlug, teamId: createBody.team.id },
        json: {
          name: "Platform Core",
          slug: "platform-core",
        },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      team: expect.objectContaining({
        id: createBody.team.id,
        name: "Platform Core",
        slug: "platform-core",
      }),
    });
  });

  it("allows admins to add members from the same organization and restricts other orgs", async () => {
    const adminIdentity = fixture.createWorkosIdentity();
    const organizationSlug = adminIdentity.organization.slug ?? "missing-slug";

    const createResponse = await client.api.orgs[":organizationSlug"].teams.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Localization",
        },
      },
      {
        headers: await fixture.authHeadersFor(adminIdentity),
      },
    );

    const createBody = (await createResponse.json()) as {
      team: {
        id: string;
      };
    };

    const sameOrgMember = fixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );
    await fixture.authHeadersFor(sameOrgMember);

    const addMemberResponse = await client.api.orgs[":organizationSlug"].teams[
      ":teamId"
    ].members.$post(
      {
        param: { organizationSlug, teamId: createBody.team.id },
        json: {
          workosUserId: sameOrgMember.user.workosUserId,
          role: "member",
        },
      },
      {
        headers: await fixture.authHeadersFor(adminIdentity),
      },
    );

    expect(addMemberResponse.status).toBe(201);

    const memberViewResponse = await client.api.orgs[":organizationSlug"].teams[":teamId"].$get(
      {
        param: { organizationSlug, teamId: createBody.team.id },
      },
      {
        headers: await fixture.authHeadersFor(sameOrgMember),
      },
    );

    expect(memberViewResponse.status).toBe(200);
    await expect(memberViewResponse.json()).resolves.toMatchObject({
      team: {
        id: createBody.team.id,
        members: expect.arrayContaining([
          expect.objectContaining({
            workosUserId: sameOrgMember.user.workosUserId,
            role: "member",
          }),
        ]),
      },
    });

    const otherOrgUser = fixture.createWorkosIdentity();
    const otherOrgResponse = await client.api.orgs[":organizationSlug"].teams[":teamId"].$get(
      {
        param: { organizationSlug, teamId: createBody.team.id },
      },
      {
        headers: await fixture.authHeadersFor(otherOrgUser),
      },
    );

    expect(otherOrgResponse.status).toBe(404);
  });

  it("preserves an existing manager role when re-adding without an explicit role", async () => {
    const adminIdentity = fixture.createWorkosIdentity();
    const organizationSlug = adminIdentity.organization.slug ?? "missing-slug";

    const createResponse = await client.api.orgs[":organizationSlug"].teams.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Localization",
        },
      },
      {
        headers: await fixture.authHeadersFor(adminIdentity),
      },
    );

    const createBody = (await createResponse.json()) as {
      team: {
        id: string;
      };
    };

    const sameOrgManager = fixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );
    await fixture.authHeadersFor(sameOrgManager);

    const firstAddResponse = await client.api.orgs[":organizationSlug"].teams[
      ":teamId"
    ].members.$post(
      {
        param: { organizationSlug, teamId: createBody.team.id },
        json: {
          workosUserId: sameOrgManager.user.workosUserId,
          role: "manager",
        },
      },
      {
        headers: await fixture.authHeadersFor(adminIdentity),
      },
    );

    expect(firstAddResponse.status).toBe(201);

    const secondAddResponse = await client.api.orgs[":organizationSlug"].teams[
      ":teamId"
    ].members.$post(
      {
        param: { organizationSlug, teamId: createBody.team.id },
        json: {
          workosUserId: sameOrgManager.user.workosUserId,
        },
      },
      {
        headers: await fixture.authHeadersFor(adminIdentity),
      },
    );

    expect(secondAddResponse.status).toBe(201);
    await expect(secondAddResponse.json()).resolves.toMatchObject({
      member: expect.objectContaining({
        workosUserId: sameOrgManager.user.workosUserId,
        role: "manager",
      }),
    });
  });

  it("returns 204 when removing a cross-org user from a team", async () => {
    const adminIdentity = fixture.createWorkosIdentity();
    const organizationSlug = adminIdentity.organization.slug ?? "missing-slug";

    const createResponse = await client.api.orgs[":organizationSlug"].teams.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Localization",
        },
      },
      {
        headers: await fixture.authHeadersFor(adminIdentity),
      },
    );

    const createBody = (await createResponse.json()) as {
      team: {
        id: string;
      };
    };

    const otherOrgUser = fixture.createWorkosIdentity();
    await fixture.authHeadersFor(otherOrgUser);

    const deleteResponse = await client.api.orgs[":organizationSlug"].teams[":teamId"].members[
      ":workosUserId"
    ].$delete(
      {
        param: {
          organizationSlug,
          teamId: createBody.team.id,
          workosUserId: otherOrgUser.user.workosUserId,
        },
      },
      {
        headers: await fixture.authHeadersFor(adminIdentity),
      },
    );

    expect(deleteResponse.status).toBe(204);
  });
});
