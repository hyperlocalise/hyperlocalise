import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const {
  deleteOrganizationMembershipMock,
  getWorkosServerClientMock,
  listInvitationsMock,
  resendInvitationMock,
  resolveApiAuthContextFromSessionMock,
  revokeInvitationMock,
  sendInvitationMock,
  updateOrganizationMembershipMock,
} = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  sendInvitationMock: vi.fn(async () => ({ id: "invitation_mock" })),
  resendInvitationMock: vi.fn(async () => ({ id: "invitation_mock" })),
  listInvitationsMock: vi.fn(async () => ({ data: [] as { id: string; state: string }[] })),
  revokeInvitationMock: vi.fn(async () => undefined),
  deleteOrganizationMembershipMock: vi.fn(async () => undefined),
  updateOrganizationMembershipMock: vi.fn(async () => undefined),
  getWorkosServerClientMock: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/workos/server-client", () => ({
  getWorkosServerClient: () => {
    const override = getWorkosServerClientMock();
    if (override !== undefined) {
      return override;
    }

    return {
      userManagement: {
        sendInvitation: sendInvitationMock,
        resendInvitation: resendInvitationMock,
        listInvitations: listInvitationsMock,
        revokeInvitation: revokeInvitationMock,
        deleteOrganizationMembership: deleteOrganizationMembershipMock,
        updateOrganizationMembership: updateOrganizationMembershipMock,
      },
    };
  },
}));

import { createApp } from "@/api/app";
import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { db, schema } from "@/lib/database";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

import { createMemberTestFixture } from "./member.fixture";
import type { MembersResponse } from "./member.schema";

function createInlineTestJobQueue(): JobQueue<TranslationJobEventData> {
  return {
    async enqueue(event) {
      return { ids: [event.jobId] };
    },
  };
}

const client = testClient(
  createApp({
    jobQueue: createInlineTestJobQueue(),
  }),
);

const memberFixture = createMemberTestFixture(client);
const {
  authHeadersFor,
  createWorkosIdentity,
  createWorkosIdentityForOrganization,
  inviteMemberViaApi,
  listMembersViaApi,
  removeMemberViaApi,
  updateMemberRoleViaApi,
} = memberFixture;

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  sendInvitationMock.mockResolvedValue({ id: "invitation_mock" });
  resendInvitationMock.mockResolvedValue({ id: "invitation_mock" });
  revokeInvitationMock.mockResolvedValue(undefined);
  listInvitationsMock.mockResolvedValue({ data: [] });
  await memberFixture.cleanup();
});

describe("memberRoutes", () => {
  it("lists workspace members for any org member", async () => {
    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);
    await inviteMemberViaApi(
      ownerIdentity,
      {
        email: "teammate@example.com",
        role: "member",
      },
      headers,
    );

    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );

    const response = await listMembersViaApi(ownerIdentity, await authHeadersFor(memberIdentity));

    expect(response.status).toBe(200);
    const body = (await response.json()) as MembersResponse;
    expect(body.members.length).toBeGreaterThanOrEqual(2);
    expect(body.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: ownerIdentity.user.email, role: "owner" }),
        expect.objectContaining({ email: "teammate@example.com", role: "member" }),
      ]),
    );
  });

  it("invites a member through WorkOS-backed workspace membership", async () => {
    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);

    const response = await inviteMemberViaApi(
      ownerIdentity,
      { email: "new-member@example.com", role: "admin" },
      headers,
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { member: { email: string; role: string } };
    expect(body.member.email).toBe("new-member@example.com");
    expect(body.member.role).toBe("admin");
  });

  it("updates a member role", async () => {
    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);

    await inviteMemberViaApi(
      ownerIdentity,
      { email: "promote-me@example.com", role: "member" },
      headers,
    );

    const listResponse = await listMembersViaApi(ownerIdentity, headers);
    const listBody = (await listResponse.json()) as MembersResponse;
    const target = listBody.members.find((member) => member.email === "promote-me@example.com");

    expect(target).toBeDefined();

    const updateResponse = await updateMemberRoleViaApi(
      ownerIdentity,
      target!.workosUserId,
      "admin",
      headers,
    );

    expect(updateResponse.status).toBe(200);
    const updateBody = (await updateResponse.json()) as { member: { role: string } };
    expect(updateBody.member.role).toBe("admin");
  });

  it("removes an invited placeholder user from the database", async () => {
    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);

    await inviteMemberViaApi(
      ownerIdentity,
      { email: "orphan-cleanup@example.com", role: "member" },
      headers,
    );

    const listResponse = await listMembersViaApi(ownerIdentity, headers);
    const listBody = (await listResponse.json()) as MembersResponse;
    const target = listBody.members.find((member) => member.email === "orphan-cleanup@example.com");

    expect(target).toBeDefined();
    expect(target!.workosUserId.startsWith("invited_user_")).toBe(true);

    const deleteResponse = await removeMemberViaApi(ownerIdentity, target!.workosUserId, headers);
    expect(deleteResponse.status).toBe(204);

    const [remainingUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, "orphan-cleanup@example.com"))
      .limit(1);

    expect(remainingUser).toBeUndefined();
  });

  it("removes organization-scoped team memberships and MCP sessions when removing a member", async () => {
    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);
    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );
    await authHeadersFor(memberIdentity);

    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(
        eq(
          schema.organizations.workosOrganizationId,
          ownerIdentity.organization.workosOrganizationId,
        ),
      )
      .limit(1);
    const [memberUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, memberIdentity.user.workosUserId))
      .limit(1);

    expect(organization).toBeDefined();
    expect(memberUser).toBeDefined();

    const [team] = await db
      .insert(schema.teams)
      .values({
        organizationId: organization!.id,
        slug: "member-removal-cleanup",
        name: "Member removal cleanup",
      })
      .returning({ id: schema.teams.id });

    await db.insert(schema.teamMemberships).values({
      teamId: team.id,
      userId: memberUser!.id,
      role: "member",
    });

    await db.insert(schema.mcpSessions).values({
      userId: memberUser!.id,
      organizationId: organization!.id,
      scope: "mcp",
      accessTokenHash: `access_${memberUser!.id}`,
      refreshTokenHash: `refresh_${memberUser!.id}`,
      expiresAt: new Date(Date.now() + 60_000),
      refreshExpiresAt: new Date(Date.now() + 120_000),
    });

    const response = await removeMemberViaApi(
      ownerIdentity,
      memberIdentity.user.workosUserId,
      headers,
    );

    expect(response.status).toBe(204);

    const remainingTeamMemberships = await db
      .select({ id: schema.teamMemberships.id })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, team.id),
          eq(schema.teamMemberships.userId, memberUser!.id),
        ),
      );
    const remainingMcpSessions = await db
      .select({ id: schema.mcpSessions.id })
      .from(schema.mcpSessions)
      .where(
        and(
          eq(schema.mcpSessions.organizationId, organization!.id),
          eq(schema.mcpSessions.userId, memberUser!.id),
        ),
      );

    expect(remainingTeamMemberships).toEqual([]);
    expect(remainingMcpSessions).toEqual([]);
  });

  it("returns 503 when WorkOS server client is unavailable for invite", async () => {
    getWorkosServerClientMock.mockReturnValueOnce(null);
    const ownerIdentity = createWorkosIdentity();

    const response = await inviteMemberViaApi(
      ownerIdentity,
      { email: "missing-client@example.com", role: "member" },
      await authHeadersFor(ownerIdentity),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "workos_server_not_configured",
    });
  });

  it("rolls back pending invite when WorkOS invitation fails", async () => {
    listInvitationsMock.mockResolvedValue({ data: [] });
    sendInvitationMock.mockRejectedValueOnce(new Error("boom"));
    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);

    const response = await inviteMemberViaApi(
      ownerIdentity,
      { email: "rollback@example.com", role: "member" },
      headers,
    );
    expect(response.status).toBe(500);

    const listBody = (await (
      await listMembersViaApi(ownerIdentity, headers)
    ).json()) as MembersResponse;
    expect(listBody.members.some((member) => member.email === "rollback@example.com")).toBe(false);
  });

  it("rolls back local role update when WorkOS sync fails", async () => {
    updateOrganizationMembershipMock.mockRejectedValueOnce(new Error("boom"));
    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);
    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );
    await authHeadersFor(memberIdentity);

    const response = await updateMemberRoleViaApi(
      ownerIdentity,
      memberIdentity.user.workosUserId,
      "admin",
      headers,
    );
    expect(response.status).toBe(500);

    const listBody = (await (
      await listMembersViaApi(ownerIdentity, headers)
    ).json()) as MembersResponse;
    expect(
      listBody.members.find((m) => m.workosUserId === memberIdentity.user.workosUserId)?.role,
    ).toBe("member");
  });

  it("preserves local membership and team data when WorkOS removal fails", async () => {
    deleteOrganizationMembershipMock.mockRejectedValueOnce(new Error("boom"));
    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);
    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );
    await authHeadersFor(memberIdentity);

    const [organization] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(
        eq(
          schema.organizations.workosOrganizationId,
          ownerIdentity.organization.workosOrganizationId,
        ),
      )
      .limit(1);
    const [memberUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, memberIdentity.user.workosUserId))
      .limit(1);

    expect(organization).toBeDefined();
    expect(memberUser).toBeDefined();

    const [team] = await db
      .insert(schema.teams)
      .values({
        organizationId: organization!.id,
        slug: "workos-removal-rollback",
        name: "WorkOS removal rollback",
      })
      .returning({ id: schema.teams.id });

    await db.insert(schema.teamMemberships).values({
      teamId: team.id,
      userId: memberUser!.id,
      role: "member",
    });

    await db.insert(schema.mcpSessions).values({
      userId: memberUser!.id,
      organizationId: organization!.id,
      scope: "mcp",
      accessTokenHash: `access_${memberUser!.id}`,
      refreshTokenHash: `refresh_${memberUser!.id}`,
      expiresAt: new Date(Date.now() + 60_000),
      refreshExpiresAt: new Date(Date.now() + 120_000),
    });

    const response = await removeMemberViaApi(
      ownerIdentity,
      memberIdentity.user.workosUserId,
      headers,
    );
    expect(response.status).toBe(500);

    const listBody = (await (
      await listMembersViaApi(ownerIdentity, headers)
    ).json()) as MembersResponse;
    expect(
      listBody.members.find((m) => m.workosUserId === memberIdentity.user.workosUserId)?.role,
    ).toBe("member");

    const remainingTeamMemberships = await db
      .select({ id: schema.teamMemberships.id })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, team.id),
          eq(schema.teamMemberships.userId, memberUser!.id),
        ),
      );
    const remainingMcpSessions = await db
      .select({ id: schema.mcpSessions.id })
      .from(schema.mcpSessions)
      .where(
        and(
          eq(schema.mcpSessions.organizationId, organization!.id),
          eq(schema.mcpSessions.userId, memberUser!.id),
        ),
      );

    expect(remainingTeamMemberships).toHaveLength(1);
    expect(remainingMcpSessions).toHaveLength(1);
  });

  it("prevents admin from assigning owner role", async () => {
    const ownerIdentity = createWorkosIdentity();
    const adminIdentity = createWorkosIdentityForOrganization(ownerIdentity.organization, "admin");

    const response = await inviteMemberViaApi(
      ownerIdentity,
      { email: "blocked-owner@example.com", role: "owner" },
      await authHeadersFor(adminIdentity),
    );

    expect(response.status).toBe(403);
  });

  it("returns member_invite_revoked_not_delivered when replace revokes but send fails", async () => {
    listInvitationsMock.mockResolvedValue({
      data: [{ id: "stale_invitation", state: "pending" }],
    });
    sendInvitationMock.mockRejectedValue(new Error("workos unavailable"));

    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);

    const response = await inviteMemberViaApi(
      ownerIdentity,
      { email: "revoked-not-sent@example.com", role: "admin" },
      headers,
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "member_invite_revoked_not_delivered",
    });
    expect(revokeInvitationMock).toHaveBeenCalledWith("stale_invitation");
    expect(sendInvitationMock).toHaveBeenCalledTimes(2);
  });

  it("replaces a stale WorkOS invitation when inviting with no local pending membership", async () => {
    listInvitationsMock.mockResolvedValue({
      data: [{ id: "stale_invitation", state: "pending" }],
    });

    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);

    const response = await inviteMemberViaApi(
      ownerIdentity,
      { email: "stale-workos@example.com", role: "admin" },
      headers,
    );
    expect(response.status).toBe(201);
    expect(revokeInvitationMock).toHaveBeenCalledWith("stale_invitation");
    expect(sendInvitationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "stale-workos@example.com",
        roleSlug: "admin",
      }),
    );
    expect(resendInvitationMock).not.toHaveBeenCalled();
  });

  it("resends a pending invitation instead of creating a duplicate membership", async () => {
    listInvitationsMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: "invitation_mock", state: "pending" }] });

    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);

    const firstResponse = await inviteMemberViaApi(
      ownerIdentity,
      { email: "resend-me@example.com", role: "member" },
      headers,
    );
    expect(firstResponse.status).toBe(201);
    expect(sendInvitationMock).toHaveBeenCalledTimes(1);

    const secondResponse = await inviteMemberViaApi(
      ownerIdentity,
      { email: "resend-me@example.com", role: "member" },
      headers,
    );
    expect(secondResponse.status).toBe(200);
    expect(sendInvitationMock).toHaveBeenCalledTimes(1);
    expect(resendInvitationMock).toHaveBeenCalledTimes(1);

    const listBody = (await (
      await listMembersViaApi(ownerIdentity, headers)
    ).json()) as MembersResponse;
    expect(
      listBody.members.filter((member) => member.email === "resend-me@example.com"),
    ).toHaveLength(1);
  });

  it("replaces a pending invitation when the role changes on resend", async () => {
    listInvitationsMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: "invitation_mock", state: "pending" }] })
      .mockResolvedValueOnce({ data: [{ id: "invitation_mock", state: "pending" }] });

    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);

    await inviteMemberViaApi(
      ownerIdentity,
      { email: "role-change@example.com", role: "member" },
      headers,
    );

    const resendResponse = await inviteMemberViaApi(
      ownerIdentity,
      { email: "role-change@example.com", role: "admin" },
      headers,
    );
    expect(resendResponse.status).toBe(200);
    expect(revokeInvitationMock).toHaveBeenCalledWith("invitation_mock");
    expect(sendInvitationMock).toHaveBeenCalledTimes(2);
    expect(resendInvitationMock).not.toHaveBeenCalled();

    const listBody = (await (
      await listMembersViaApi(ownerIdentity, headers)
    ).json()) as MembersResponse;
    const member = listBody.members.find((row) => row.email === "role-change@example.com");
    expect(member?.role).toBe("admin");
  });

  it("rolls back a role change when resend delivery fails", async () => {
    sendInvitationMock.mockReset();
    listInvitationsMock.mockReset();
    revokeInvitationMock.mockReset();

    let sendInvitationCalls = 0;
    sendInvitationMock.mockImplementation(async () => {
      sendInvitationCalls += 1;
      if (sendInvitationCalls > 1) {
        throw new Error("workos unavailable");
      }
      return { id: "invitation_mock" };
    });

    let listInvitationCalls = 0;
    listInvitationsMock.mockImplementation(async () => {
      listInvitationCalls += 1;
      if (listInvitationCalls === 1) {
        return { data: [] };
      }
      return { data: [{ id: "invitation_mock", state: "pending" }] };
    });
    revokeInvitationMock.mockResolvedValue(undefined);

    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);

    await inviteMemberViaApi(
      ownerIdentity,
      { email: "rollback-role@example.com", role: "member" },
      headers,
    );

    const failedResend = await inviteMemberViaApi(
      ownerIdentity,
      { email: "rollback-role@example.com", role: "admin" },
      headers,
    );
    expect(failedResend.status).toBe(500);

    const listBody = (await (
      await listMembersViaApi(ownerIdentity, headers)
    ).json()) as MembersResponse;
    const member = listBody.members.find((row) => row.email === "rollback-role@example.com");
    expect(member?.role).toBe("member");
  });

  it("replaces a pending WorkOS invitation when PATCH changes an existing user's role", async () => {
    listInvitationsMock.mockResolvedValue({
      data: [{ id: "invitation_mock", state: "pending" }],
    });

    const ownerIdentity = createWorkosIdentity();
    const existingUserIdentity = createWorkosIdentity();
    await syncWorkosIdentity(db, existingUserIdentity);

    const headers = await authHeadersFor(ownerIdentity);
    await inviteMemberViaApi(
      ownerIdentity,
      { email: existingUserIdentity.user.email, role: "member" },
      headers,
    );

    const updateResponse = await updateMemberRoleViaApi(
      ownerIdentity,
      existingUserIdentity.user.workosUserId,
      "admin",
      headers,
    );
    expect(updateResponse.status).toBe(200);
    expect(revokeInvitationMock).toHaveBeenCalledWith("invitation_mock");
    expect(sendInvitationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: existingUserIdentity.user.email,
        roleSlug: "admin",
      }),
    );
    expect(updateOrganizationMembershipMock).not.toHaveBeenCalled();
  });

  it("rolls back PATCH role changes for pending members when invitation sync fails", async () => {
    listInvitationsMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: "invitation_mock", state: "pending" }] });
    revokeInvitationMock.mockRejectedValueOnce(new Error("workos unavailable"));

    const ownerIdentity = createWorkosIdentity();
    const existingUserIdentity = createWorkosIdentity();
    await syncWorkosIdentity(db, existingUserIdentity);

    const headers = await authHeadersFor(ownerIdentity);
    await inviteMemberViaApi(
      ownerIdentity,
      { email: existingUserIdentity.user.email, role: "member" },
      headers,
    );

    const updateResponse = await updateMemberRoleViaApi(
      ownerIdentity,
      existingUserIdentity.user.workosUserId,
      "admin",
      headers,
    );
    expect(updateResponse.status).toBe(500);

    const listBody = (await (
      await listMembersViaApi(ownerIdentity, headers)
    ).json()) as MembersResponse;
    expect(
      listBody.members.find((row) => row.email === existingUserIdentity.user.email)?.role,
    ).toBe("member");
  });

  it("shows existing users as invited until WorkOS confirms membership", async () => {
    const ownerIdentity = createWorkosIdentity();
    const existingUserIdentity = createWorkosIdentity();
    await syncWorkosIdentity(db, existingUserIdentity);

    const headers = await authHeadersFor(ownerIdentity);
    const response = await inviteMemberViaApi(
      ownerIdentity,
      { email: existingUserIdentity.user.email, role: "member" },
      headers,
    );
    expect(response.status).toBe(201);

    const listBody = (await (
      await listMembersViaApi(ownerIdentity, headers)
    ).json()) as MembersResponse;
    const invited = listBody.members.find(
      (member) => member.email === existingUserIdentity.user.email,
    );
    expect(invited?.status).toBe("invited");
    expect(invited?.workosUserId).toBe(existingUserIdentity.user.workosUserId);
  });

  it("revokes WorkOS invitations when removing a pending existing user", async () => {
    listInvitationsMock.mockResolvedValue({
      data: [{ id: "invitation_mock", state: "pending" }],
    });

    const ownerIdentity = createWorkosIdentity();
    const existingUserIdentity = createWorkosIdentity();
    await syncWorkosIdentity(db, existingUserIdentity);

    const headers = await authHeadersFor(ownerIdentity);
    await inviteMemberViaApi(
      ownerIdentity,
      { email: existingUserIdentity.user.email, role: "member" },
      headers,
    );

    const deleteResponse = await removeMemberViaApi(
      ownerIdentity,
      existingUserIdentity.user.workosUserId,
      headers,
    );
    expect(deleteResponse.status).toBe(204);
    expect(revokeInvitationMock).toHaveBeenCalled();
  });

  it("returns 409 when removing the last owner", async () => {
    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);

    const response = await removeMemberViaApi(
      ownerIdentity,
      ownerIdentity.user.workosUserId,
      headers,
    );

    expect(response.status).toBe(409);
  });
});
