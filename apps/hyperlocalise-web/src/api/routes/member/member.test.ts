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

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

vi.mock("@/lib/workos/server-client", () => ({
  getWorkosServerClient: () => ({
    userManagement: {
      sendInvitation: vi.fn(async () => ({ id: "invitation_mock" })),
      listInvitations: vi.fn(async () => ({
        data: [{ id: "invitation_mock", state: "pending" }],
      })),
      revokeInvitation: vi.fn(async () => undefined),
      deleteOrganizationMembership: vi.fn(async () => undefined),
    },
  }),
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

  it("removes a member", async () => {
    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);

    await inviteMemberViaApi(
      ownerIdentity,
      { email: "remove-me@example.com", role: "member" },
      headers,
    );

    const listResponse = await listMembersViaApi(ownerIdentity, headers);
    const listBody = (await listResponse.json()) as MembersResponse;
    const target = listBody.members.find((member) => member.email === "remove-me@example.com");

    const deleteResponse = await removeMemberViaApi(ownerIdentity, target!.workosUserId, headers);
    expect(deleteResponse.status).toBe(204);

    const afterList = (await (
      await listMembersViaApi(ownerIdentity, headers)
    ).json()) as MembersResponse;
    expect(afterList.members.some((member) => member.email === "remove-me@example.com")).toBe(
      false,
    );
  });

  it("returns 403 when a member invites someone", async () => {
    const ownerIdentity = createWorkosIdentity();
    await authHeadersFor(ownerIdentity);

    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );

    const response = await inviteMemberViaApi(
      ownerIdentity,
      { email: "blocked@example.com", role: "member" },
      await authHeadersFor(memberIdentity),
    );

    expect(response.status).toBe(403);
  });

  it("returns 409 when inviting an existing member", async () => {
    const ownerIdentity = createWorkosIdentity();
    const headers = await authHeadersFor(ownerIdentity);

    await inviteMemberViaApi(
      ownerIdentity,
      { email: "duplicate@example.com", role: "member" },
      headers,
    );

    const response = await inviteMemberViaApi(
      ownerIdentity,
      { email: "duplicate@example.com", role: "member" },
      headers,
    );

    expect(response.status).toBe(409);
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
