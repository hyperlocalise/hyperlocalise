import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db } from "@/lib/database";

import { createTeamTestFixture } from "./team.fixture";
import type { TeamResponse } from "./team.schema";

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

const client = testClient(app);
const fixture = createTeamTestFixture(client);

describe("teamRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("allows an org admin to create and list teams", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await fixture.createTeamViaApi(identity, { name: "Platform" });

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
    const response = await fixture.createTeamViaApi(identity, { name: "Support" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "forbidden",
    });
  });

  it("returns 409 when creating or updating a team to a duplicate slug", async () => {
    const identity = fixture.createWorkosIdentity();
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const firstCreateResponse = await fixture.createTeamViaApi(identity, { name: "Platform" });

    expect(firstCreateResponse.status).toBe(201);

    const duplicateCreateResponse = await fixture.createTeamViaApi(identity, { name: "Platform" });

    expect(duplicateCreateResponse.status).toBe(409);
    await expect(duplicateCreateResponse.json()).resolves.toEqual({
      error: "team_slug_already_exists",
    });

    const secondCreateResponse = await fixture.createTeamViaApi(identity, {
      name: "Operations",
      slug: "operations",
    });

    const secondCreateBody = (await secondCreateResponse.json()) as TeamResponse;

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

    const createResponse = await fixture.createTeamViaApi(identity, { name: "Platform" });

    const createBody = (await createResponse.json()) as TeamResponse;

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

    const createResponse = await fixture.createTeamViaApi(adminIdentity, { name: "Localization" });

    const createBody = (await createResponse.json()) as TeamResponse;

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

    const createResponse = await fixture.createTeamViaApi(adminIdentity, { name: "Localization" });

    const createBody = (await createResponse.json()) as TeamResponse;

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

  it("includes the current user's team role in team listings", async () => {
    const adminIdentity = fixture.createWorkosIdentity();
    const organizationSlug = adminIdentity.organization.slug ?? "missing-slug";

    const createResponse = await fixture.createTeamViaApi(adminIdentity, { name: "Localization" });
    const createBody = (await createResponse.json()) as TeamResponse;

    const listResponse = await client.api.orgs[":organizationSlug"].teams.$get(
      {
        param: { organizationSlug },
      },
      {
        headers: await fixture.authHeadersFor(adminIdentity),
      },
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      teams: [
        expect.objectContaining({
          id: createBody.team.id,
          currentUserRole: "manager",
        }),
      ],
    });
  });

  it("allows team managers to manage membership without org admin rights", async () => {
    const adminIdentity = fixture.createWorkosIdentity();
    const organizationSlug = adminIdentity.organization.slug ?? "missing-slug";

    const createResponse = await fixture.createTeamViaApi(adminIdentity, { name: "Localization" });
    const createBody = (await createResponse.json()) as TeamResponse;

    const teamManager = fixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );
    await fixture.authHeadersFor(teamManager);

    const promoteResponse = await client.api.orgs[":organizationSlug"].teams[
      ":teamId"
    ].members.$post(
      {
        param: { organizationSlug, teamId: createBody.team.id },
        json: {
          workosUserId: teamManager.user.workosUserId,
          role: "manager",
        },
      },
      {
        headers: await fixture.authHeadersFor(adminIdentity),
      },
    );

    expect(promoteResponse.status).toBe(201);

    const teammate = fixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );
    await fixture.authHeadersFor(teammate);

    const addMemberResponse = await client.api.orgs[":organizationSlug"].teams[
      ":teamId"
    ].members.$post(
      {
        param: { organizationSlug, teamId: createBody.team.id },
        json: {
          email: teammate.user.email,
          role: "member",
        },
      },
      {
        headers: await fixture.authHeadersFor(teamManager),
      },
    );

    expect(addMemberResponse.status).toBe(201);

    const patchTeamResponse = await client.api.orgs[":organizationSlug"].teams[":teamId"].$patch(
      {
        param: { organizationSlug, teamId: createBody.team.id },
        json: { name: "Renamed Team" },
      },
      {
        headers: await fixture.authHeadersFor(teamManager),
      },
    );

    expect(patchTeamResponse.status).toBe(403);

    const removeResponse = await client.api.orgs[":organizationSlug"].teams[":teamId"].members[
      ":workosUserId"
    ].$delete(
      {
        param: {
          organizationSlug,
          teamId: createBody.team.id,
          workosUserId: teammate.user.workosUserId,
        },
      },
      {
        headers: await fixture.authHeadersFor(teamManager),
      },
    );

    expect(removeResponse.status).toBe(204);
  });

  it("blocks team members from mutating team membership", async () => {
    const adminIdentity = fixture.createWorkosIdentity();
    const organizationSlug = adminIdentity.organization.slug ?? "missing-slug";

    const createResponse = await fixture.createTeamViaApi(adminIdentity, { name: "Localization" });
    const createBody = (await createResponse.json()) as TeamResponse;

    const teamMember = fixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );
    await fixture.authHeadersFor(teamMember);

    await client.api.orgs[":organizationSlug"].teams[":teamId"].members.$post(
      {
        param: { organizationSlug, teamId: createBody.team.id },
        json: {
          workosUserId: teamMember.user.workosUserId,
          role: "member",
        },
      },
      {
        headers: await fixture.authHeadersFor(adminIdentity),
      },
    );

    const outsider = fixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );
    await fixture.authHeadersFor(outsider);

    const addMemberResponse = await client.api.orgs[":organizationSlug"].teams[
      ":teamId"
    ].members.$post(
      {
        param: { organizationSlug, teamId: createBody.team.id },
        json: {
          workosUserId: outsider.user.workosUserId,
          role: "member",
        },
      },
      {
        headers: await fixture.authHeadersFor(teamMember),
      },
    );

    expect(addMemberResponse.status).toBe(403);
  });

  it("allows admins to delete empty teams and blocks teams with projects", async () => {
    const adminIdentity = fixture.createWorkosIdentity();
    const organizationSlug = adminIdentity.organization.slug ?? "missing-slug";

    const emptyTeamResponse = await fixture.createTeamViaApi(adminIdentity, { name: "Empty Team" });
    const emptyTeamBody = (await emptyTeamResponse.json()) as TeamResponse;

    const deleteEmptyResponse = await client.api.orgs[":organizationSlug"].teams[":teamId"].$delete(
      {
        param: { organizationSlug, teamId: emptyTeamBody.team.id },
      },
      {
        headers: await fixture.authHeadersFor(adminIdentity),
      },
    );

    expect(deleteEmptyResponse.status).toBe(204);

    const projectTeamResponse = await fixture.createTeamViaApi(adminIdentity, {
      name: "Project Team",
    });
    const projectTeamBody = (await projectTeamResponse.json()) as TeamResponse;

    const projectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Scoped Project",
          teamId: projectTeamBody.team.id,
        },
      },
      {
        headers: await fixture.authHeadersFor(adminIdentity),
      },
    );

    expect(projectResponse.status).toBe(201);

    const deleteBlockedResponse = await client.api.orgs[":organizationSlug"].teams[
      ":teamId"
    ].$delete(
      {
        param: { organizationSlug, teamId: projectTeamBody.team.id },
      },
      {
        headers: await fixture.authHeadersFor(adminIdentity),
      },
    );

    expect(deleteBlockedResponse.status).toBe(409);
    await expect(deleteBlockedResponse.json()).resolves.toEqual({
      error: "team_has_projects",
    });
  });

  it("returns 204 when removing a cross-org user from a team", async () => {
    const adminIdentity = fixture.createWorkosIdentity();
    const organizationSlug = adminIdentity.organization.slug ?? "missing-slug";

    const createResponse = await fixture.createTeamViaApi(adminIdentity, { name: "Localization" });

    const createBody = (await createResponse.json()) as TeamResponse;

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
