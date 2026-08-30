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

import { eq } from "drizzle-orm";
import { mockAudit } from "evlog";
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
import { clearReplacingWorkosMembershipSentinel } from "@/api/test-cleanup";
import { db, schema } from "@/lib/database/client";
import { generateApiKey, getApiKeyPrefix, hashApiKey } from "@/lib/security/api-keys";
import {
  ACCESS_TOKEN_AUDIT_ACTIONS,
  ACCESS_TOKEN_REVOKE_REASONS,
} from "@/lib/security/access-token-audit";
import {
  INVITED_WORKOS_USER_ID_PREFIX,
  REPLACING_WORKOS_MEMBERSHIP_ID,
} from "@/lib/workos/constants";

const { createWorkosIdentity, cleanup, trackWorkosUserId } = createAuthTestFixture();

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

    await clearReplacingWorkosMembershipSentinel(db);
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

  it("removes pending invite rows for revoked invitations", async () => {
    const ownerIdentity = createWorkosIdentity();
    await syncWorkosIdentity(db, ownerIdentity);

    const pendingEmail = `revoked-${randomUUID()}@example.com`;
    const placeholderUserId = `${INVITED_WORKOS_USER_ID_PREFIX}${randomUUID()}`;

    trackWorkosUserId(placeholderUserId);

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

describe("promoteInvitedPlaceholderUser", () => {
  it("returns false when no placeholder user exists for the email", async () => {
    const promoted = await promoteInvitedPlaceholderUser(db, {
      email: "missing@example.com",
      workosUserId: "user_real",
    });

    expect(promoted).toBe(false);
  });

  it("returns false when the email is blank", async () => {
    const promoted = await promoteInvitedPlaceholderUser(db, {
      email: "   ",
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
      apiKeysRevoked: 0,
    });
  });

  it("emits membership-removal audits for each revoked token", async () => {
    const captured = mockAudit();
    const identity = createWorkosIdentity();
    const synced = await syncWorkosIdentity(db, identity);
    const plainKey = generateApiKey();

    const [apiKey] = await db
      .insert(schema.organizationApiKeys)
      .values({
        organizationId: synced.organization.id,
        name: "Leaving Member Key",
        keyHash: hashApiKey(plainKey),
        keyPrefix: getApiKeyPrefix(plainKey),
        createdByUserId: synced.user.id,
      })
      .returning({
        id: schema.organizationApiKeys.id,
        keyPrefix: schema.organizationApiKeys.keyPrefix,
      });

    const result = await revokeOrganizationMembershipAccess(db, {
      workosMembershipId: identity.membership.workosMembershipId,
      workosOrganizationId: identity.organization.workosOrganizationId,
      workosUserId: identity.user.workosUserId,
      actor: { type: "system", id: "workos_webhook" },
    });

    expect(result.apiKeysRevoked).toBe(1);
    const event = captured.assertAudit({
      action: ACCESS_TOKEN_AUDIT_ACTIONS.revoked,
      actor: { type: "system", id: "workos_webhook" },
      target: { id: apiKey!.id },
    });
    expect(event.reason).toBe(ACCESS_TOKEN_REVOKE_REASONS.membershipRemoved);
    expect(event.target).toMatchObject({
      organizationId: synced.organization.id,
      ownerUserId: synced.user.id,
      keyPrefix: apiKey!.keyPrefix,
    });
    expect(JSON.stringify(event)).not.toContain(plainKey);
    expect(JSON.stringify(event)).not.toContain(identity.user.email);
    captured.restore();
  });
});
