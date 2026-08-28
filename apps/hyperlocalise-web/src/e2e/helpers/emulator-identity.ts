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
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { syncWorkosOrganization } from "@/api/auth/workos-sync";
import { cleanupWorkosTestRecords } from "@/api/test-cleanup";
import { db, schema } from "@/lib/database/client";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { slugifyOrganizationName } from "@/lib/onboarding/slugify-organization-name";

import { assertEmulatorReady, createEmulatorWorkosClient, roleSlugForE2e } from "./emulator-client";

export type EmulatorIdentity = {
  email: string;
  organizationName: string;
  organizationSlug: string;
  password: string;
  workosOrganizationId: string;
  workosUserId: string;
  workosMembershipId?: string;
};

async function createUniqueOrganizationSlug(baseName: string) {
  const baseSlug = slugifyOrganizationName(baseName);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const [existing] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, candidate))
      .limit(1);
    if (!existing) {
      return candidate;
    }
  }

  return `${baseSlug}-${randomUUID().slice(0, 8)}`;
}

/**
 * Provisions a WorkOS user (and optionally an org + membership) in the emulator.
 *
 * When an organization is created, a matching local organization row is seeded
 * with a slug so `/dashboard` can redirect after AuthKit login. Membership and
 * user rows are still created by the real reconcile path on first authenticated
 * request — that is the point of replacing fixture auth.
 */
export async function provisionEmulatorIdentity(input: {
  mode: "admin" | "onboarding";
  role?: OrganizationMembershipRole;
}): Promise<EmulatorIdentity> {
  await assertEmulatorReady();

  const workos = createEmulatorWorkosClient();
  const suffix = randomUUID().slice(0, 8);
  const email = `e2e-${suffix}@example.test`;
  const password = `e2e-password-${suffix}`;
  const firstName = "E2E";
  const lastName = input.mode === "onboarding" ? "Onboarding" : "Admin";

  const user = await workos.userManagement.createUser({
    email,
    password,
    emailVerified: true,
    firstName,
    lastName,
  });

  if (input.mode === "onboarding") {
    return {
      email,
      organizationName: "",
      organizationSlug: "",
      password,
      workosOrganizationId: "",
      workosUserId: user.id,
    };
  }

  const organizationName = `E2E Org ${suffix}`;
  const organizationSlug = await createUniqueOrganizationSlug(organizationName);
  const organization = await workos.organizations.createOrganization({
    name: organizationName,
  });

  const membership = await workos.userManagement.createOrganizationMembership({
    organizationId: organization.id,
    userId: user.id,
    roleSlug: roleSlugForE2e(input.role ?? "admin"),
  });

  // Reconcile creates org rows without a slug; seed the slug so dashboard routing works.
  await syncWorkosOrganization(db, {
    workosOrganizationId: organization.id,
    name: organization.name,
    slug: organizationSlug,
  });

  return {
    email,
    organizationName,
    organizationSlug,
    password,
    workosOrganizationId: organization.id,
    workosUserId: user.id,
    workosMembershipId: membership.id,
  };
}

/**
 * After onboarding creates a workspace in WorkOS + Postgres, update the tracked
 * identity so suite teardown can delete the org/membership/local rows.
 */
export async function captureOnboardingWorkspace(identity: EmulatorIdentity) {
  if (!identity.workosUserId || identity.workosOrganizationId) {
    return identity;
  }

  const workos = createEmulatorWorkosClient();
  const page = await workos.userManagement.listOrganizationMemberships({
    userId: identity.workosUserId,
  });
  const memberships = await page.autoPagination();
  const membership = memberships[0];
  if (!membership) {
    return identity;
  }

  identity.workosOrganizationId = membership.organizationId;
  identity.workosMembershipId = membership.id;

  const [organization] = await db
    .select({
      name: schema.organizations.name,
      slug: schema.organizations.slug,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.workosOrganizationId, membership.organizationId))
    .limit(1);

  if (organization) {
    identity.organizationName = organization.name;
    identity.organizationSlug = organization.slug ?? "";
  }

  return identity;
}

export async function cleanupEmulatorIdentity(identity: EmulatorIdentity) {
  // Onboarding identities only learn their workspace ids once the workspace exists,
  // so resolve them here too — a spec that fails after creation never captures them.
  try {
    await captureOnboardingWorkspace(identity);
  } catch {
    // Best-effort; fall back to whatever ids the identity already carries.
  }

  const workosOrganizationIds = identity.workosOrganizationId
    ? [identity.workosOrganizationId]
    : [];
  const workosUserIds = identity.workosUserId ? [identity.workosUserId] : [];

  await cleanupWorkosTestRecords({
    workosOrganizationIds,
    workosUserIds,
  });

  const workos = createEmulatorWorkosClient();

  if (identity.workosMembershipId) {
    try {
      await workos.userManagement.deleteOrganizationMembership(identity.workosMembershipId);
    } catch {
      // Best-effort; membership may already be gone with the org.
    }
  }

  if (identity.workosOrganizationId) {
    try {
      await workos.organizations.deleteOrganization(identity.workosOrganizationId);
    } catch {
      // Best-effort emulator cleanup.
    }
  }

  if (identity.workosUserId) {
    try {
      await workos.userManagement.deleteUser(identity.workosUserId);
    } catch {
      // Best-effort emulator cleanup.
    }
  }
}
