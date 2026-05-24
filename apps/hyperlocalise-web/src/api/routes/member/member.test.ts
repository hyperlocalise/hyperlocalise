import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const {
  deleteOrganizationMembershipMock,
  getWorkosServerClientMock,
  listInvitationsMock,
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
  listInvitationsMock: vi.fn(async () => ({
    data: [{ id: "invitation_mock", state: "pending" }],
  })),
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
  getWorkosServerClient: () =>
    getWorkosServerClientMock() ?? {
      userManagement: {
        sendInvitation: sendInvitationMock,
        listInvitations: listInvitationsMock,
        revokeInvitation: revokeInvitationMock,
        deleteOrganizationMembership: deleteOrganizationMembershipMock,
        updateOrganizationMembership: updateOrganizationMembershipMock,
      },
    },
}));

import { createApp } from "@/api/app";
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
    sendInvitationMock.mockRejectedValueOnce(new Error("boom"));
    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);

    const response = await inviteMemberViaApi(
      ownerIdentity,
      { email: "rollback@example.com", role: "member" },
      headers,
    );
    expect(response.status).toBe(500);

    const listBody = (await (await listMembersViaApi(ownerIdentity, headers)).json()) as MembersResponse;
    expect(listBody.members.some((member) => member.email === "rollback@example.com")).toBe(false);
  });

  it("rolls back local role update when WorkOS sync fails", async () => {
    updateOrganizationMembershipMock.mockRejectedValueOnce(new Error("boom"));
    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);
    const memberIdentity = createWorkosIdentityForOrganization(ownerIdentity.organization, "member");

    const response = await updateMemberRoleViaApi(
      ownerIdentity,
      memberIdentity.user.workosUserId,
      "admin",
      headers,
    );
    expect(response.status).toBe(500);

    const listBody = (await (await listMembersViaApi(ownerIdentity, headers)).json()) as MembersResponse;
    expect(
      listBody.members.find((m) => m.workosUserId === memberIdentity.user.workosUserId)?.role,
    ).toBe("member");
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
