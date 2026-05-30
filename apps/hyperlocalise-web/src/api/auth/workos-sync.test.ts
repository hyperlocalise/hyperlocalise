import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import {
  clearPendingMembershipReplacingInvitation,
  markPendingMembershipReplacingInvitation,
  promoteInvitedPlaceholderUser,
  removePendingOrganizationMembershipForInvite,
  revokeOrganizationMembershipAccess,
  syncWorkosIdentity,
} from "@/api/auth/workos-sync";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import {
  INVITED_WORKOS_USER_ID_PREFIX,
  REPLACING_WORKOS_MEMBERSHIP_ID,
} from "@/lib/workos/constants";

const { createWorkosIdentity, cleanup } = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await cleanup();
});

describe("removePendingOrganizationMembershipForInvite", () => {
  it("does not delete memberships marked as replacing an invitation", async () => {
    const ownerIdentity = createWorkosIdentity();
    const invitedIdentity = createWorkosIdentity();
    await syncWorkosIdentity(db, ownerIdentity);
    await syncWorkosIdentity(db, invitedIdentity);

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

    const [invitedUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, invitedIdentity.user.workosUserId))
      .limit(1);

    expect(organization).toBeDefined();
    expect(invitedUser).toBeDefined();

    const [membership] = await db
      .insert(schema.organizationMemberships)
      .values({
        organizationId: organization!.id,
        userId: invitedUser!.id,
        role: "member",
        workosMembershipId: null,
      })
      .returning({ id: schema.organizationMemberships.id });

    const marked = await markPendingMembershipReplacingInvitation(db, membership.id);
    expect(marked).toBe(true);

    const deleted = await removePendingOrganizationMembershipForInvite(db, {
      workosOrganizationId: ownerIdentity.organization.workosOrganizationId,
      email: invitedIdentity.user.email,
    });
    expect(deleted).toBe(0);

    const [remaining] = await db
      .select({ workosMembershipId: schema.organizationMemberships.workosMembershipId })
      .from(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.id, membership.id))
      .limit(1);

    expect(remaining?.workosMembershipId).toBe(REPLACING_WORKOS_MEMBERSHIP_ID);

    await clearPendingMembershipReplacingInvitation(db, membership.id);
    await db
      .delete(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.id, membership.id));
  });
});

describe("promoteInvitedPlaceholderUser", () => {
  it("returns false when no placeholder user exists for the email", async () => {
    const promoted = await promoteInvitedPlaceholderUser(db, {
      email: "missing@example.com",
      workosUserId: "user_real",
    });

    expect(promoted).toBe(false);
  });
});

describe("revokeOrganizationMembershipAccess", () => {
  it("is a no-op when the membership id is unknown", async () => {
    const result = await revokeOrganizationMembershipAccess(db, {
      workosMembershipId: "membership_missing",
    });

    expect(result).toEqual({
      organizationMembershipsDeleted: 0,
      teamMembershipsDeleted: 0,
      mcpSessionsDeleted: 0,
    });
  });

  it("removes pending invite rows for revoked invitations", async () => {
    const ownerIdentity = createWorkosIdentity();
    await syncWorkosIdentity(db, ownerIdentity);

    const pendingEmail = `revoked-${randomUUID()}@example.com`;
    const placeholderUserId = `${INVITED_WORKOS_USER_ID_PREFIX}${randomUUID()}`;

    await syncWorkosIdentity(db, {
      user: {
        workosUserId: placeholderUserId,
        email: pendingEmail,
      },
      organization: ownerIdentity.organization,
      membership: {
        role: "member",
      },
    });

    const deleted = await removePendingOrganizationMembershipForInvite(db, {
      workosOrganizationId: ownerIdentity.organization.workosOrganizationId,
      email: pendingEmail,
    });

    expect(deleted).toBe(1);
  });
});
