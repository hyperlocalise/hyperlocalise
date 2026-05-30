import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect } from "vite-plus/test";

import type { ApiAuthContext, WorkosAuthIdentity } from "@/api/auth/workos";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { enrichAuthContextWithCapabilities } from "@/api/auth/policy";
import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { db, schema } from "@/lib/database";
import { resolveOrganizationMembershipAccessSource } from "@/lib/workos/membership-access";
import { cleanupWorkosTestRecords } from "./test-cleanup";

declare global {
  var __testApiAuthContext: ApiAuthContext | undefined;
  var __resolveTestApiAuthContextFromSession:
    | ((options?: { cookie?: string; organizationSlug?: string }) => ApiAuthContext | null)
    | undefined;
}

const testApiAuthContextsBySession = new Map<string, ApiAuthContext>();

type CreatedTestAuthRecords = {
  workosOrganizationIds: Set<string>;
  workosUserIds: Set<string>;
  sessionTokens: Set<string>;
};

function testSessionTokenFromCookie(cookie: string | undefined) {
  return cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("wos-session="))
    ?.slice("wos-session=".length);
}

function withMembershipAccessSource<
  T extends { workosMembershipId: string | null; role: OrganizationMembershipRole },
>(membership: T) {
  return {
    ...membership,
    accessSource: resolveOrganizationMembershipAccessSource(membership.workosMembershipId),
  };
}

function switchAuthContextOrganization(
  authContext: ApiAuthContext,
  organizationSlug: string | undefined,
) {
  if (!organizationSlug || authContext.organization.slug == null) {
    return authContext;
  }

  const activeOrganization = authContext.organizations.find(
    (organization) => organization.slug === organizationSlug,
  );

  if (!activeOrganization) {
    return authContext;
  }

  return enrichAuthContextWithCapabilities({
    ...authContext,
    organization: activeOrganization,
    activeOrganization,
    membership: withMembershipAccessSource({
      workosMembershipId: activeOrganization.membership.workosMembershipId ?? null,
      role: activeOrganization.membership.role,
    }),
  });
}

globalThis.__resolveTestApiAuthContextFromSession = (options = {}) => {
  const token = testSessionTokenFromCookie(options.cookie);
  const authContext =
    options.cookie === undefined
      ? (globalThis.__testApiAuthContext ?? null)
      : token
        ? (testApiAuthContextsBySession.get(token) ?? null)
        : null;

  if (!authContext) {
    return null;
  }

  return switchAuthContextOrganization(authContext, options.organizationSlug);
};

export function createAuthTestFixture() {
  const createdRecordsByTest = new Map<string, CreatedTestAuthRecords>();

  function currentTestKey() {
    return expect.getState().currentTestName ?? "__test_auth_fixture_default__";
  }

  function currentTestRecords() {
    const testKey = currentTestKey();
    const existing = createdRecordsByTest.get(testKey);

    if (existing) {
      return existing;
    }

    const records: CreatedTestAuthRecords = {
      workosOrganizationIds: new Set<string>(),
      workosUserIds: new Set<string>(),
      sessionTokens: new Set<string>(),
    };
    createdRecordsByTest.set(testKey, records);

    return records;
  }

  function createWorkosIdentityWithRole(
    role: WorkosAuthIdentity["membership"]["role"],
  ): WorkosAuthIdentity {
    const suffix = randomUUID();
    const workosUserId = `user_${suffix}`;
    const workosOrganizationId = `org_${suffix}`;
    const records = currentTestRecords();

    records.workosUserIds.add(workosUserId);
    records.workosOrganizationIds.add(workosOrganizationId);

    return {
      user: {
        workosUserId,
        email: `${suffix}@example.com`,
      },
      organization: {
        workosOrganizationId,
        name: `Example Org ${suffix}`,
        slug: `example-org-${suffix}`,
      },
      membership: {
        workosMembershipId: `membership_${suffix}`,
        role,
      },
    };
  }

  function createWorkosIdentity(): WorkosAuthIdentity {
    return createWorkosIdentityWithRole("owner");
  }

  function createWorkosIdentityForOrganization(
    organization: WorkosAuthIdentity["organization"],
    role: WorkosAuthIdentity["membership"]["role"],
  ): WorkosAuthIdentity {
    const suffix = randomUUID();
    const workosUserId = `user_${suffix}`;
    const records = currentTestRecords();

    records.workosUserIds.add(workosUserId);
    records.workosOrganizationIds.add(organization.workosOrganizationId);

    return {
      user: {
        workosUserId,
        email: `${suffix}@example.com`,
      },
      organization,
      membership: {
        workosMembershipId: `membership_${suffix}`,
        role,
      },
    };
  }

  function toAuthOrganization(
    organization: Awaited<ReturnType<typeof syncWorkosIdentity>>["organization"],
    membership: Awaited<ReturnType<typeof syncWorkosIdentity>>["membership"],
  ) {
    return {
      workosOrganizationId: organization.workosOrganizationId,
      localOrganizationId: organization.id,
      name: organization.name,
      slug: organization.slug,
      membership: withMembershipAccessSource({
        workosMembershipId: membership.workosMembershipId,
        role: membership.role,
      }),
    };
  }

  async function authHeadersFor(identity: WorkosAuthIdentity) {
    const { user, organization, membership } = await syncWorkosIdentity(db, identity);
    const activeOrganization = toAuthOrganization(organization, membership);

    const authContext = enrichAuthContextWithCapabilities({
      user: {
        workosUserId: user.workosUserId,
        localUserId: user.id,
        email: user.email,
      },
      organizations: [activeOrganization],
      organization: activeOrganization,
      activeOrganization,
      membership: withMembershipAccessSource({
        workosMembershipId: membership.workosMembershipId,
        role: membership.role,
      }),
      activeTeam: null,
    });
    const sessionToken = `test_${randomUUID()}`;
    const records = currentTestRecords();

    records.sessionTokens.add(sessionToken);
    testApiAuthContextsBySession.set(sessionToken, authContext);
    globalThis.__testApiAuthContext = authContext;

    return {
      cookie: `wos-session=${sessionToken}`,
    };
  }

  async function authHeadersForOrganizations(identities: WorkosAuthIdentity[]) {
    if (identities.length === 0) {
      throw new Error("expected at least one organization identity");
    }

    const organizations = [];
    let user: Awaited<ReturnType<typeof syncWorkosIdentity>>["user"] | null = null;

    for (const identity of identities) {
      const synced = await syncWorkosIdentity(db, identity);
      user = synced.user;
      organizations.push(toAuthOrganization(synced.organization, synced.membership));
    }

    if (!user) {
      throw new Error("expected synced user for organization identities");
    }

    const activeOrganization = organizations[0]!;
    const authContext = enrichAuthContextWithCapabilities({
      user: {
        workosUserId: user.workosUserId,
        localUserId: user.id,
        email: user.email,
      },
      organizations,
      organization: activeOrganization,
      activeOrganization,
      membership: withMembershipAccessSource({
        workosMembershipId: activeOrganization.membership.workosMembershipId,
        role: activeOrganization.membership.role,
      }),
      activeTeam: null,
    });
    const sessionToken = `test_${randomUUID()}`;
    const records = currentTestRecords();

    records.sessionTokens.add(sessionToken);
    testApiAuthContextsBySession.set(sessionToken, authContext);
    globalThis.__testApiAuthContext = authContext;

    return {
      cookie: `wos-session=${sessionToken}`,
      organizations,
    };
  }

  async function createLocalWorkosIdentity(identity = createWorkosIdentity()) {
    const records = currentTestRecords();

    records.workosUserIds.add(identity.user.workosUserId);
    records.workosOrganizationIds.add(identity.organization.workosOrganizationId);

    const { user, organization, membership } = await syncWorkosIdentity(db, identity);

    return {
      identity,
      membership,
      organization,
      user,
    };
  }

  async function getLocalUserId(workosUserId: string) {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, workosUserId))
      .limit(1);

    if (!user) {
      throw new Error(`expected local user for ${workosUserId}`);
    }

    return user.id;
  }

  async function cleanup() {
    const testKey = currentTestKey();
    const records = createdRecordsByTest.get(testKey);

    globalThis.__testApiAuthContext = undefined;

    if (!records) {
      return;
    }

    for (const sessionToken of records.sessionTokens) {
      testApiAuthContextsBySession.delete(sessionToken);
    }

    await cleanupWorkosTestRecords({
      workosOrganizationIds: records.workosOrganizationIds,
      workosUserIds: records.workosUserIds,
    });

    createdRecordsByTest.delete(testKey);
  }

  function trackWorkosUserId(workosUserId: string) {
    currentTestRecords().workosUserIds.add(workosUserId);
  }

  return {
    authHeadersFor,
    authHeadersForOrganizations,
    cleanup,
    createLocalWorkosIdentity,
    createWorkosIdentity,
    createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole,
    getLocalUserId,
    trackWorkosUserId,
  };
}
