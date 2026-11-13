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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

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
import { INVITED_WORKOS_USER_ID_PREFIX, replacingWorkosMembershipId } from "@/lib/workos/constants";

const { enqueueActivityLogEventsMock } = vi.hoisted(() => ({
  enqueueActivityLogEventsMock: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/activity-log/activity-log-writer", () => ({
  enqueueActivityLogEvents: enqueueActivityLogEventsMock,
}));

const { createWorkosIdentity, createWorkosIdentityForOrganization, cleanup, trackWorkosUserId } =
  createAuthTestFixture();

function enqueuedActivityEvents() {
  return enqueueActivityLogEventsMock.mock.calls.flatMap(([events]) => events);
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  enqueueActivityLogEventsMock.mockClear();
});

afterEach(async () => {
  await cleanup();
});

describe("syncWorkosIdentity activity", () => {
  it("records member_joined when a pending invite becomes an active membership", async () => {
    const ownerIdentity = createWorkosIdentity();
    await syncWorkosIdentity(db, ownerIdentity);
    const invitedIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "translator",
    );
    await syncWorkosIdentity(db, {
      ...invitedIdentity,
      membership: { role: "translator" },
    });
    enqueueActivityLogEventsMock.mockClear();

    const synced = await syncWorkosIdentity(db, invitedIdentity, { recordActivity: true });

    expect(enqueuedActivityEvents()).toEqual([
      expect.objectContaining({
        actorKind: "user",
        actorUserId: synced.user.id,
        eventType: "member_joined",
        organizationId: synced.organization.id,
        payload: expect.objectContaining({ memberUserId: synced.user.id, role: "translator" }),
        targetKind: "membership",
      }),
    ]);
  });

  it("records member_role_changed when WorkOS changes an active member role", async () => {
    const ownerIdentity = createWorkosIdentity();
    await syncWorkosIdentity(db, ownerIdentity);
    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "translator",
    );
    await syncWorkosIdentity(db, memberIdentity);
    enqueueActivityLogEventsMock.mockClear();

    const synced = await syncWorkosIdentity(
      db,
      { ...memberIdentity, membership: { ...memberIdentity.membership, role: "reviewer" } },
      { recordActivity: true },
    );

    expect(enqueuedActivityEvents()).toEqual([
      expect.objectContaining({
        actorKind: "system",
        eventType: "member_role_changed",
        organizationId: synced.organization.id,
        payload: expect.objectContaining({ nextRole: "reviewer", previousRole: "translator" }),
      }),
    ]);
  });

  it("records nothing when an active membership is re-synced unchanged", async () => {
    const identity = createWorkosIdentity();
    await syncWorkosIdentity(db, identity);
    enqueueActivityLogEventsMock.mockClear();

    await syncWorkosIdentity(db, identity, { recordActivity: true });

    expect(enqueuedActivityEvents()).toEqual([]);
  });
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

    expect(remaining?.workosMembershipId).toBe(replacingWorkosMembershipId(membership.id));

    await clearPendingMembershipReplacingInvitation(db, membership.id);
    await db
      .delete(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.id, membership.id));
  });

  it("marks two pending memberships replacing without colliding on the unique index", async () => {
    const ownerIdentity = createWorkosIdentity();
    const firstInvite = createWorkosIdentity();
    const secondInvite = createWorkosIdentity();
    await syncWorkosIdentity(db, ownerIdentity);
    await syncWorkosIdentity(db, firstInvite);
    await syncWorkosIdentity(db, secondInvite);

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

    const [firstUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, firstInvite.user.workosUserId))
      .limit(1);
    const [secondUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, secondInvite.user.workosUserId))
      .limit(1);

    expect(organization).toBeDefined();
    expect(firstUser).toBeDefined();
    expect(secondUser).toBeDefined();

    const [firstMembership] = await db
      .insert(schema.organizationMemberships)
      .values({
        organizationId: organization!.id,
        userId: firstUser!.id,
        role: "member",
        workosMembershipId: null,
      })
      .returning({ id: schema.organizationMemberships.id });
    const [secondMembership] = await db
      .insert(schema.organizationMemberships)
      .values({
        organizationId: organization!.id,
        userId: secondUser!.id,
        role: "member",
        workosMembershipId: null,
      })
      .returning({ id: schema.organizationMemberships.id });

    const [firstMarked, secondMarked] = await Promise.all([
      markPendingMembershipReplacingInvitation(db, firstMembership.id),
      markPendingMembershipReplacingInvitation(db, secondMembership.id),
    ]);
    expect(firstMarked).toBe(true);
    expect(secondMarked).toBe(true);

    await db
      .delete(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.id, firstMembership.id));
    await db
      .delete(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.id, secondMembership.id));
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

  it("records member_invite_revoked for each revoked pending invite", async () => {
    const ownerIdentity = createWorkosIdentity();
    const owner = await syncWorkosIdentity(db, ownerIdentity);

    const pendingEmail = `revoked-${randomUUID()}@example.com`;
    const placeholderUserId = `${INVITED_WORKOS_USER_ID_PREFIX}${randomUUID()}`;
    trackWorkosUserId(placeholderUserId);

    await syncWorkosIdentity(db, {
      user: { workosUserId: placeholderUserId, email: pendingEmail },
      organization: ownerIdentity.organization,
      membership: { role: "member" },
    });
    enqueueActivityLogEventsMock.mockClear();

    await removePendingOrganizationMembershipForInvite(db, {
      workosOrganizationId: ownerIdentity.organization.workosOrganizationId,
      email: pendingEmail,
      recordActivity: true,
    });

    expect(enqueuedActivityEvents()).toEqual([
      expect.objectContaining({
        actorKind: "system",
        eventType: "member_invite_revoked",
        organizationId: owner.organization.id,
        targetKind: "invitation",
      }),
    ]);
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
      figmaOauthTokensRevoked: 0,
      canvaOauthTokensRevoked: 0,
      sanityOauthTokensRevoked: 0,
    });
  });

  it("revokes leftover plugin tokens when the membership row is already gone", async () => {
    const identity = createWorkosIdentity();
    const synced = await syncWorkosIdentity(db, identity);
    const [apiKey] = await db
      .insert(schema.organizationApiKeys)
      .values({
        organizationId: synced.organization.id,
        name: "Sanity leftover PAT",
        keyHash: `hash_sanity_${randomUUID()}`,
        keyPrefix: "hl_sanity",
        createdByUserId: synced.user.id,
      })
      .returning({ id: schema.organizationApiKeys.id });
    const [sanityConnection] = await db
      .insert(schema.sanityConnections)
      .values({
        organizationId: synced.organization.id,
        apiKeyId: apiKey!.id,
        displayName: "Leftover Sanity",
      })
      .returning({ id: schema.sanityConnections.id });
    const [sanityToken] = await db
      .insert(schema.sanityOauthTokens)
      .values({
        connectionId: sanityConnection!.id,
        userId: synced.user.id,
        organizationId: synced.organization.id,
        studioOrigin: "https://studio.example",
        accessTokenHash: `sanity_at_gone_${randomUUID()}`,
        refreshTokenHash: `sanity_rt_gone_${randomUUID()}`,
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: schema.sanityOauthTokens.id });

    await db
      .delete(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.userId, synced.user.id));

    const result = await revokeOrganizationMembershipAccess(db, {
      workosMembershipId: identity.membership.workosMembershipId,
      workosOrganizationId: identity.organization.workosOrganizationId,
      workosUserId: identity.user.workosUserId,
    });

    expect(result.organizationMembershipsDeleted).toBe(0);
    expect(result.sanityOauthTokensRevoked).toBe(1);
    const [after] = await db
      .select({ revokedAt: schema.sanityOauthTokens.revokedAt })
      .from(schema.sanityOauthTokens)
      .where(eq(schema.sanityOauthTokens.id, sanityToken!.id))
      .limit(1);
    expect(after?.revokedAt).not.toBeNull();
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

  it("revokes only the departing member's unrevoked personal access tokens", async () => {
    const ownerIdentity = createWorkosIdentity();
    const departingIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "translator",
    );

    await syncWorkosIdentity(db, ownerIdentity);
    await syncWorkosIdentity(db, departingIdentity);

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

    const [ownerUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, ownerIdentity.user.workosUserId))
      .limit(1);

    const [departingUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, departingIdentity.user.workosUserId))
      .limit(1);

    expect(organization).toBeDefined();
    expect(ownerUser).toBeDefined();
    expect(departingUser).toBeDefined();

    const [ownerKey] = await db
      .insert(schema.organizationApiKeys)
      .values({
        organizationId: organization!.id,
        name: "Owner Token",
        keyHash: `hash_owner_${randomUUID()}`,
        keyPrefix: "hl_owner",
        permissions: ["jobs:read"],
        createdByUserId: ownerUser!.id,
      })
      .returning({ id: schema.organizationApiKeys.id });

    const [departingKey] = await db
      .insert(schema.organizationApiKeys)
      .values({
        organizationId: organization!.id,
        name: "Departing Token",
        keyHash: `hash_departing_${randomUUID()}`,
        keyPrefix: "hl_depar",
        permissions: ["jobs:read"],
        createdByUserId: departingUser!.id,
      })
      .returning({ id: schema.organizationApiKeys.id });

    const [alreadyRevokedKey] = await db
      .insert(schema.organizationApiKeys)
      .values({
        organizationId: organization!.id,
        name: "Already Revoked Token",
        keyHash: `hash_revoked_${randomUUID()}`,
        keyPrefix: "hl_revok",
        permissions: ["jobs:read"],
        createdByUserId: departingUser!.id,
        revokedAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      .returning({
        id: schema.organizationApiKeys.id,
        revokedAt: schema.organizationApiKeys.revokedAt,
      });

    const result = await revokeOrganizationMembershipAccess(db, {
      workosMembershipId: departingIdentity.membership.workosMembershipId,
      workosOrganizationId: ownerIdentity.organization.workosOrganizationId,
      workosUserId: departingIdentity.user.workosUserId,
    });

    expect(result.organizationMembershipsDeleted).toBe(1);
    expect(result.apiKeysRevoked).toBe(1);

    const [ownerKeyAfter] = await db
      .select({ revokedAt: schema.organizationApiKeys.revokedAt })
      .from(schema.organizationApiKeys)
      .where(eq(schema.organizationApiKeys.id, ownerKey!.id))
      .limit(1);
    const [departingKeyAfter] = await db
      .select({ revokedAt: schema.organizationApiKeys.revokedAt })
      .from(schema.organizationApiKeys)
      .where(eq(schema.organizationApiKeys.id, departingKey!.id))
      .limit(1);
    const [alreadyRevokedAfter] = await db
      .select({ revokedAt: schema.organizationApiKeys.revokedAt })
      .from(schema.organizationApiKeys)
      .where(eq(schema.organizationApiKeys.id, alreadyRevokedKey!.id))
      .limit(1);

    expect(ownerKeyAfter?.revokedAt).toBeNull();
    expect(departingKeyAfter?.revokedAt).not.toBeNull();
    expect(alreadyRevokedAfter?.revokedAt?.toISOString()).toBe(
      alreadyRevokedKey!.revokedAt!.toISOString(),
    );
  });

  it("revokes the departing member's Figma and Canva OAuth tokens", async () => {
    const ownerIdentity = createWorkosIdentity();
    const departingIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "admin",
    );

    await syncWorkosIdentity(db, ownerIdentity);
    const departing = await syncWorkosIdentity(db, departingIdentity);

    const [ownerUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, ownerIdentity.user.workosUserId))
      .limit(1);

    const [apiKey] = await db
      .insert(schema.organizationApiKeys)
      .values({
        organizationId: departing.organization.id,
        name: "Plugin PAT",
        keyHash: `hash_plugin_${randomUUID()}`,
        keyPrefix: "hl_plugi",
        permissions: ["files:write", "jobs:write"],
        createdByUserId: ownerUser!.id,
      })
      .returning({ id: schema.organizationApiKeys.id });

    const [figmaConnection] = await db
      .insert(schema.figmaConnections)
      .values({
        organizationId: departing.organization.id,
        apiKeyId: apiKey!.id,
        displayName: "Org Figma",
        connectionTokenHash: `figma_conn_${randomUUID()}`,
        connectionTokenPrefix: "hl_figma",
      })
      .returning({ id: schema.figmaConnections.id });

    const [canvaConnection] = await db
      .insert(schema.canvaConnections)
      .values({
        organizationId: departing.organization.id,
        apiKeyId: apiKey!.id,
        displayName: "Org Canva",
        connectionTokenHash: `canva_conn_${randomUUID()}`,
        connectionTokenPrefix: "hl_canva",
      })
      .returning({ id: schema.canvaConnections.id });

    const [sanityConnection] = await db
      .insert(schema.sanityConnections)
      .values({
        organizationId: departing.organization.id,
        apiKeyId: apiKey!.id,
        displayName: "Org Sanity",
      })
      .returning({ id: schema.sanityConnections.id });

    const [ownerFigmaToken] = await db
      .insert(schema.figmaOauthTokens)
      .values({
        connectionId: figmaConnection!.id,
        userId: ownerUser!.id,
        organizationId: departing.organization.id,
        accessTokenHash: `figma_at_owner_${randomUUID()}`,
        refreshTokenHash: `figma_rt_owner_${randomUUID()}`,
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: schema.figmaOauthTokens.id });

    const [departingFigmaToken] = await db
      .insert(schema.figmaOauthTokens)
      .values({
        connectionId: figmaConnection!.id,
        userId: departing.user.id,
        organizationId: departing.organization.id,
        accessTokenHash: `figma_at_leaving_${randomUUID()}`,
        refreshTokenHash: `figma_rt_leaving_${randomUUID()}`,
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: schema.figmaOauthTokens.id });

    const [departingCanvaToken] = await db
      .insert(schema.canvaOauthTokens)
      .values({
        connectionId: canvaConnection!.id,
        userId: departing.user.id,
        organizationId: departing.organization.id,
        accessTokenHash: `canva_at_leaving_${randomUUID()}`,
        refreshTokenHash: `canva_rt_leaving_${randomUUID()}`,
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: schema.canvaOauthTokens.id });

    const [departingSanityToken] = await db
      .insert(schema.sanityOauthTokens)
      .values({
        connectionId: sanityConnection!.id,
        userId: departing.user.id,
        organizationId: departing.organization.id,
        studioOrigin: "https://studio.example",
        accessTokenHash: `sanity_at_leaving_${randomUUID()}`,
        refreshTokenHash: `sanity_rt_leaving_${randomUUID()}`,
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: schema.sanityOauthTokens.id });

    const alreadyRevokedAt = new Date("2026-01-01T00:00:00.000Z");
    const [alreadyRevokedFigmaToken] = await db
      .insert(schema.figmaOauthTokens)
      .values({
        connectionId: figmaConnection!.id,
        userId: departing.user.id,
        organizationId: departing.organization.id,
        accessTokenHash: `figma_at_revoked_${randomUUID()}`,
        refreshTokenHash: `figma_rt_revoked_${randomUUID()}`,
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        revokedAt: alreadyRevokedAt,
      })
      .returning({
        id: schema.figmaOauthTokens.id,
        revokedAt: schema.figmaOauthTokens.revokedAt,
      });

    const result = await revokeOrganizationMembershipAccess(db, {
      workosMembershipId: departingIdentity.membership.workosMembershipId,
      workosOrganizationId: ownerIdentity.organization.workosOrganizationId,
      workosUserId: departingIdentity.user.workosUserId,
    });

    expect(result.organizationMembershipsDeleted).toBe(1);
    expect(result.figmaOauthTokensRevoked).toBe(1);
    expect(result.canvaOauthTokensRevoked).toBe(1);
    expect(result.sanityOauthTokensRevoked).toBe(1);

    const [ownerFigmaAfter] = await db
      .select({ revokedAt: schema.figmaOauthTokens.revokedAt })
      .from(schema.figmaOauthTokens)
      .where(eq(schema.figmaOauthTokens.id, ownerFigmaToken!.id))
      .limit(1);
    const [departingFigmaAfter] = await db
      .select({ revokedAt: schema.figmaOauthTokens.revokedAt })
      .from(schema.figmaOauthTokens)
      .where(eq(schema.figmaOauthTokens.id, departingFigmaToken!.id))
      .limit(1);
    const [departingCanvaAfter] = await db
      .select({ revokedAt: schema.canvaOauthTokens.revokedAt })
      .from(schema.canvaOauthTokens)
      .where(eq(schema.canvaOauthTokens.id, departingCanvaToken!.id))
      .limit(1);
    const [departingSanityAfter] = await db
      .select({ revokedAt: schema.sanityOauthTokens.revokedAt })
      .from(schema.sanityOauthTokens)
      .where(eq(schema.sanityOauthTokens.id, departingSanityToken!.id))
      .limit(1);
    const [alreadyRevokedAfter] = await db
      .select({ revokedAt: schema.figmaOauthTokens.revokedAt })
      .from(schema.figmaOauthTokens)
      .where(eq(schema.figmaOauthTokens.id, alreadyRevokedFigmaToken!.id))
      .limit(1);

    expect(ownerFigmaAfter?.revokedAt).toBeNull();
    expect(departingFigmaAfter?.revokedAt).not.toBeNull();
    expect(departingCanvaAfter?.revokedAt).not.toBeNull();
    expect(departingSanityAfter?.revokedAt).not.toBeNull();
    expect(alreadyRevokedAfter?.revokedAt?.toISOString()).toBe(
      alreadyRevokedFigmaToken!.revokedAt!.toISOString(),
    );
  });
});
