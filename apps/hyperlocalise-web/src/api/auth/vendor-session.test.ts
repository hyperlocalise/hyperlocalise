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

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { resolveApiKeyTeamAccessContext } from "@/api/auth/api-key-access";
import {
  getCapabilitiesForRole,
  hasCapability,
  ORGANIZATION_CAPABILITIES,
} from "@/api/auth/policy";
import { getVisibleTeamIds } from "@/api/auth/team-access";
import { VendorAccessDeniedError } from "@/api/auth/vendor-access";
import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";
import { assignableRolesForActor } from "@/lib/members/member-management";
import {
  ensureDefaultWorkspaceTeam,
  ensureTeamMembership,
} from "@/lib/teams/default-workspace-team";
import { workosRoleSlugToMembershipRole } from "@/lib/workos/membership-role";

// The real session function, with only WorkOS itself stood in for, as in
// identity-access-regression.test.ts.
const { withAuthMock, listMembershipsMock, getOrganizationMock, liveWorkosApiKey } = vi.hoisted(
  () => ({
    withAuthMock: vi.fn(),
    listMembershipsMock: vi.fn().mockResolvedValue({ autoPagination: async () => [] }),
    getOrganizationMock: vi.fn(),
    liveWorkosApiKey: { enabled: true },
  }),
);

vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: withAuthMock }));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    env: new Proxy(actual.env, {
      get(target, property, receiver) {
        if (property === "WORKOS_API_KEY" && liveWorkosApiKey.enabled) {
          return "sk_test_vendor_session";
        }
        return Reflect.get(target, property, receiver);
      },
    }),
  };
});

vi.mock("@/lib/workos/server-client", () => ({
  getWorkosServerClient: () => ({
    userManagement: { listOrganizationMemberships: listMembershipsMock },
    organizations: { getOrganization: getOrganizationMock },
  }),
}));

const fixture = createAuthTestFixture();
const app = createApp();
const sessionHeaders = { cookie: "wos-session=vendor-session" };

type Identity = ReturnType<typeof fixture.createWorkosIdentityWithRole>;

function signIn(identity: Identity, memberships: Identity[] = [identity]) {
  withAuthMock.mockResolvedValue({
    user: {
      id: identity.user.workosUserId,
      email: identity.user.email,
      firstName: null,
      lastName: null,
      profilePictureUrl: null,
    },
    organizationId: identity.organization.workosOrganizationId,
  });
  listMembershipsMock.mockResolvedValue({
    autoPagination: async () =>
      memberships.map((membership) => ({
        id: membership.membership.workosMembershipId,
        organizationId: membership.organization.workosOrganizationId,
        status: "active",
        role: { slug: membership.membership.role },
      })),
  });
  getOrganizationMock.mockImplementation(async (workosOrganizationId: string) => {
    const match = memberships.find(
      (membership) => membership.organization.workosOrganizationId === workosOrganizationId,
    );
    return { id: workosOrganizationId, name: match?.organization.name ?? "Workspace" };
  });
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  withAuthMock.mockReset();
  listMembershipsMock.mockReset();
  listMembershipsMock.mockResolvedValue({ autoPagination: async () => [] });
  getOrganizationMock.mockReset();
  await fixture.cleanup();
});

afterAll(() => {
  liveWorkosApiKey.enabled = false;
});

describe("a vendor's session", () => {
  it("is refused unless the caller allows vendors", async () => {
    const vendor = fixture.createWorkosIdentityWithRole("vendor");
    await syncWorkosIdentity(db, vendor);
    signIn(vendor);
    const { resolveApiAuthContextFromSession } = await import("./workos-session");

    await expect(resolveApiAuthContextFromSession()).rejects.toBeInstanceOf(
      VendorAccessDeniedError,
    );
    await expect(
      resolveApiAuthContextFromSession({ organizationSlug: vendor.organization.slug }),
    ).rejects.toMatchObject({ organizationSlug: vendor.organization.slug });

    const auth = await resolveApiAuthContextFromSession({ allowVendor: true });
    expect(auth?.membership.role).toBe("vendor");
    expect(auth?.capabilities).toEqual([]);
    expect(auth?.activeTeam).toBeNull();
  });

  it("keeps the role when WorkOS reports it at sign-in", async () => {
    expect(workosRoleSlugToMembershipRole("vendor")).toBe("vendor");
    // The local row says translator; WorkOS, which is authoritative, says vendor.
    const local = fixture.createWorkosIdentityWithRole("translator");
    await syncWorkosIdentity(db, local);
    signIn({ ...local, membership: { ...local.membership, role: "vendor" } });
    const { resolveApiAuthContextFromSession } = await import("./workos-session");

    await expect(resolveApiAuthContextFromSession()).rejects.toBeInstanceOf(
      VendorAccessDeniedError,
    );
  });

  it("is refused by the API on a route that is not opened, and reaches one that is", async () => {
    const vendor = fixture.createWorkosIdentityWithRole("vendor");
    await syncWorkosIdentity(db, vendor);
    signIn(vendor);
    const base = `http://localhost/api/orgs/${vendor.organization.slug}`;

    for (const path of ["/projects", "/jobs/job_1", "/glossaries", "/tms-provider/connection"]) {
      const response = await app.request(`${base}${path}`, { headers: sessionHeaders });
      expect(response.status, path).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: "forbidden" });
    }

    const markDone = await app.request(`${base}/jobs/job_that_is_not_theirs/mark-done`, {
      method: "POST",
      headers: sessionHeaders,
    });
    expect(markDone.status).toBe(404);
    await expect(markDone.json()).resolves.toMatchObject({ error: "job_not_found" });
  });

  it("does not shut the person out of another workspace where they have another role", async () => {
    const vendor = fixture.createWorkosIdentityWithRole("vendor");
    const elsewhere = fixture.createWorkosIdentityWithRole("admin");
    const adminElsewhere = { ...elsewhere, user: vendor.user };
    await syncWorkosIdentity(db, vendor);
    await syncWorkosIdentity(db, adminElsewhere);
    signIn(vendor, [vendor, adminElsewhere]);
    const { resolveApiAuthContextFromSession } = await import("./workos-session");

    const auth = await resolveApiAuthContextFromSession({
      organizationSlug: elsewhere.organization.slug,
    });
    expect(auth?.membership.role).toBe("admin");
    await expect(
      resolveApiAuthContextFromSession({ organizationSlug: vendor.organization.slug }),
    ).rejects.toBeInstanceOf(VendorAccessDeniedError);
  });
});

describe("the Vendor role", () => {
  it("holds no capability", () => {
    expect(getCapabilitiesForRole("vendor")).toEqual([]);
    for (const capability of ORGANIZATION_CAPABILITIES) {
      expect(hasCapability("vendor", capability), capability).toBe(false);
    }
  });

  it("can be given by admins and localization managers only", () => {
    expect(assignableRolesForActor("admin")).toContain("vendor");
    expect(assignableRolesForActor("localization_manager")).toContain("vendor");
    for (const role of ["developer", "reviewer", "translator", "member", "vendor"] as const) {
      expect(assignableRolesForActor(role)).toEqual([]);
    }
  });

  it("never passes the team rule, whatever team the person was left in", async () => {
    const vendor = fixture.createWorkosIdentityWithRole("vendor");
    const auth = await fixture.authContextFor(vendor);
    const team = await ensureDefaultWorkspaceTeam(auth.organization.localOrganizationId);
    await ensureTeamMembership({ teamId: team.id, userId: auth.user.localUserId, role: "member" });

    expect(await getVisibleTeamIds(auth)).toEqual([]);
  });

  it("cannot act through a token, an agent or a plugin connection", async () => {
    // The same person, first as a translator and then as a vendor.
    const person = fixture.createWorkosIdentityWithRole("translator");
    const auth = await fixture.authContextFor(person);
    const owner = {
      organizationId: auth.organization.localOrganizationId,
      createdByUserId: auth.user.localUserId,
    };

    signIn(person);
    expect((await resolveApiKeyTeamAccessContext(owner))?.membership.role).toBe("translator");

    signIn({ ...person, membership: { ...person.membership, role: "vendor" } });
    expect(await resolveApiKeyTeamAccessContext(owner)).toBeNull();

    signIn(person);
    expect((await resolveApiKeyTeamAccessContext(owner))?.membership.role).toBe("translator");
  });
});
