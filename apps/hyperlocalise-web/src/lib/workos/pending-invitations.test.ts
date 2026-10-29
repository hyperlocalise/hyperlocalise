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

import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { isErr, isOk } from "@/lib/primitives/result/results";

const workosMocks = vi.hoisted(() => ({
  listInvitations: vi.fn(),
  acceptInvitation: vi.fn(),
  listOrganizationMemberships: vi.fn(),
  getOrganization: vi.fn(),
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    env: new Proxy(actual.env, {
      get(target, property, receiver) {
        if (property === "WORKOS_API_KEY") {
          return "sk_test_pending_invitations";
        }

        return Reflect.get(target, property, receiver);
      },
    }),
  };
});

vi.mock("@/lib/workos/server-client", () => ({
  getWorkosServerClient: () => ({
    userManagement: {
      listInvitations: workosMocks.listInvitations,
      acceptInvitation: workosMocks.acceptInvitation,
      listOrganizationMemberships: workosMocks.listOrganizationMemberships,
    },
    organizations: {
      getOrganization: workosMocks.getOrganization,
    },
  }),
}));

import {
  acceptPendingInvitation,
  hasPendingInvitationToOrganization,
  listPendingInvitations,
} from "./pending-invitations";

const { createWorkosIdentity, cleanup } = createAuthTestFixture();

afterEach(async () => {
  vi.resetAllMocks();
  await cleanup();
});

/** A person in one workspace with a pending invite to a second one. */
async function invitedToSecondWorkspace() {
  const homeIdentity = createWorkosIdentity();
  const invitingIdentity = createWorkosIdentity();
  const home = await syncWorkosIdentity(db, homeIdentity);
  const inviting = await syncWorkosIdentity(db, invitingIdentity);

  await db.insert(schema.organizationMemberships).values({
    organizationId: inviting.organization.id,
    userId: home.user.id,
    role: "member",
    workosMembershipId: null,
  });

  const sessionUser = {
    id: homeIdentity.user.workosUserId,
    email: homeIdentity.user.email,
    emailVerified: true,
  };

  return { homeIdentity, invitingIdentity, sessionUser };
}

describe("pending invitations", () => {
  it("lists a second workspace the person is invited to and not their own", async () => {
    const { homeIdentity, invitingIdentity, sessionUser } = await invitedToSecondWorkspace();

    expect(await listPendingInvitations(sessionUser.id)).toEqual([
      {
        organizationName: invitingIdentity.organization.name,
        organizationSlug: invitingIdentity.organization.slug,
      },
    ]);
    expect(
      await hasPendingInvitationToOrganization(sessionUser.id, invitingIdentity.organization.slug!),
    ).toBe(true);
    expect(
      await hasPendingInvitationToOrganization(sessionUser.id, homeIdentity.organization.slug!),
    ).toBe(false);
  });

  it("accepts the invitation in WorkOS and activates the membership", async () => {
    const { invitingIdentity, sessionUser } = await invitedToSecondWorkspace();
    workosMocks.listInvitations.mockResolvedValue({
      data: [{ id: "invitation_1", email: sessionUser.email.toUpperCase(), state: "pending" }],
    });
    workosMocks.acceptInvitation.mockResolvedValue({ id: "invitation_1", state: "accepted" });
    workosMocks.listOrganizationMemberships.mockResolvedValue({
      autoPagination: async () => [
        {
          id: `om_${randomUUID()}`,
          organizationId: invitingIdentity.organization.workosOrganizationId,
          status: "active",
          role: { slug: "member" },
        },
      ],
    });
    workosMocks.getOrganization.mockResolvedValue({
      id: invitingIdentity.organization.workosOrganizationId,
      name: invitingIdentity.organization.name,
    });

    const result = await acceptPendingInvitation({
      sessionUser,
      organizationSlug: invitingIdentity.organization.slug!,
    });

    expect(isOk(result) && result.value.organizationSlug).toBe(invitingIdentity.organization.slug);
    expect(workosMocks.listInvitations).toHaveBeenCalledWith({
      organizationId: invitingIdentity.organization.workosOrganizationId,
      email: sessionUser.email,
    });
    expect(workosMocks.acceptInvitation).toHaveBeenCalledWith("invitation_1");
    expect(await listPendingInvitations(sessionUser.id)).toEqual([]);
  });

  it("reports a WorkOS failure without touching the membership", async () => {
    const { invitingIdentity, sessionUser } = await invitedToSecondWorkspace();
    workosMocks.listInvitations.mockResolvedValue({
      data: [{ id: "invitation_1", email: sessionUser.email, state: "pending" }],
    });
    workosMocks.acceptInvitation.mockRejectedValue(new Error("WorkOS is down"));

    const result = await acceptPendingInvitation({
      sessionUser,
      organizationSlug: invitingIdentity.organization.slug!,
    });

    expect(isErr(result) && result.error.code).toBe("workos_accept_failed");
    expect(await listPendingInvitations(sessionUser.id)).toHaveLength(1);
  });

  it("says so when WorkOS accepted but the membership has not appeared yet", async () => {
    const { invitingIdentity, sessionUser } = await invitedToSecondWorkspace();
    workosMocks.listInvitations.mockResolvedValue({
      data: [{ id: "invitation_1", email: sessionUser.email, state: "pending" }],
    });
    workosMocks.acceptInvitation.mockResolvedValue({ id: "invitation_1", state: "accepted" });
    workosMocks.listOrganizationMemberships.mockResolvedValue({ autoPagination: async () => [] });

    const result = await acceptPendingInvitation({
      sessionUser,
      organizationSlug: invitingIdentity.organization.slug!,
    });

    expect(isErr(result) && result.error.code).toBe("membership_not_activated");
  });

  it("finishes joining when the invitation was already accepted elsewhere", async () => {
    const { invitingIdentity, sessionUser } = await invitedToSecondWorkspace();
    workosMocks.listInvitations.mockResolvedValue({
      data: [{ id: "invitation_1", email: sessionUser.email, state: "accepted" }],
    });
    workosMocks.listOrganizationMemberships.mockResolvedValue({
      autoPagination: async () => [
        {
          id: `om_${randomUUID()}`,
          organizationId: invitingIdentity.organization.workosOrganizationId,
          status: "active",
          role: { slug: "member" },
        },
      ],
    });
    workosMocks.getOrganization.mockResolvedValue({
      id: invitingIdentity.organization.workosOrganizationId,
      name: invitingIdentity.organization.name,
    });

    const result = await acceptPendingInvitation({
      sessionUser,
      organizationSlug: invitingIdentity.organization.slug!,
    });

    expect(isOk(result)).toBe(true);
    expect(workosMocks.acceptInvitation).not.toHaveBeenCalled();
  });

  it("ignores an invitation that is no longer pending", async () => {
    const { invitingIdentity, sessionUser } = await invitedToSecondWorkspace();
    workosMocks.listInvitations.mockResolvedValue({
      data: [{ id: "invitation_1", email: sessionUser.email, state: "expired" }],
    });

    const result = await acceptPendingInvitation({
      sessionUser,
      organizationSlug: invitingIdentity.organization.slug!,
    });

    expect(isErr(result) && result.error.code).toBe("invitation_not_found");
    expect(workosMocks.acceptInvitation).not.toHaveBeenCalled();
  });

  it("refuses an unverified email without calling WorkOS", async () => {
    const { invitingIdentity, sessionUser } = await invitedToSecondWorkspace();

    const result = await acceptPendingInvitation({
      sessionUser: { ...sessionUser, emailVerified: false },
      organizationSlug: invitingIdentity.organization.slug!,
    });

    expect(isErr(result) && result.error.code).toBe("email_not_verified");
    expect(workosMocks.listInvitations).not.toHaveBeenCalled();
  });

  it("never accepts an invitation addressed to someone else", async () => {
    const { invitingIdentity, sessionUser } = await invitedToSecondWorkspace();
    workosMocks.listInvitations.mockResolvedValue({
      data: [{ id: "invitation_other", email: "someone-else@example.com", state: "pending" }],
    });

    const result = await acceptPendingInvitation({
      sessionUser,
      organizationSlug: invitingIdentity.organization.slug!,
    });

    expect(isErr(result) && result.error.code).toBe("invitation_not_found");
    expect(workosMocks.acceptInvitation).not.toHaveBeenCalled();
  });

  it("refuses a workspace the person is not invited to", async () => {
    const { homeIdentity, sessionUser } = await invitedToSecondWorkspace();

    const result = await acceptPendingInvitation({
      sessionUser,
      organizationSlug: homeIdentity.organization.slug!,
    });

    expect(isErr(result) && result.error.code).toBe("invitation_not_found");
    expect(workosMocks.listInvitations).not.toHaveBeenCalled();
  });
});
