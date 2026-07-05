import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import type { UserInfo } from "@workos-inc/authkit-nextjs";

import type { ApiAuthContext } from "@/api/auth/workos";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { cleanupWorkosTestRecords } from "@/api/test-cleanup";
import { syncWorkosUser } from "@/api/auth/workos-sync";
import { db } from "@/lib/database";
import {
  createWorkosIdentityWithRole,
  switchAuthContextOrganization,
  syncWorkosIdentityToAuthContext,
  withMembershipAccessSource,
} from "@/test/auth-seed";
import { enrichAuthContextWithCapabilities } from "@/api/auth/policy";

import { FIXTURE_SESSION_PREFIX, isFixtureAuthEnabled, isFixtureSessionToken } from "./config";

type FixtureSessionRecord = {
  authContext: ApiAuthContext | null;
  cleanup: {
    workosOrganizationIds: string[];
    workosUserIds: string[];
  };
  session: UserInfo;
  onboarding: boolean;
};

declare global {
  var __fixtureAuthSessions: Map<string, FixtureSessionRecord> | undefined;
}

const fixtureSessions = globalThis.__fixtureAuthSessions ?? new Map<string, FixtureSessionRecord>();
globalThis.__fixtureAuthSessions = fixtureSessions;

export function parseFixtureSessionToken(cookieHeader: string | undefined) {
  if (!cookieHeader) {
    return null;
  }

  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("wos-session="))
    ?.slice("wos-session=".length);

  return isFixtureSessionToken(token) ? token : null;
}

export function getFixtureSessionRecord(token: string | null | undefined) {
  if (!token || !isFixtureSessionToken(token)) {
    return null;
  }

  return fixtureSessions.get(token) ?? null;
}

export function hasFixtureSessionCookie(cookieHeader: string | undefined) {
  return Boolean(parseFixtureSessionToken(cookieHeader));
}

export async function cleanupFixtureAuthSession(token: string | null | undefined) {
  if (!token || !isFixtureSessionToken(token)) {
    return;
  }

  const record = fixtureSessions.get(token);
  if (!record) {
    return;
  }

  await cleanupWorkosTestRecords(record.cleanup);
  fixtureSessions.delete(token);
}

export async function cleanupAllFixtureAuthSessions() {
  for (const token of fixtureSessions.keys()) {
    await cleanupFixtureAuthSession(token);
  }
}

export async function resolveFixtureAuthSession(): Promise<UserInfo | null> {
  if (!isFixtureAuthEnabled()) {
    return null;
  }

  let token: string | undefined;
  try {
    const cookieStore = await cookies();
    token = cookieStore.get("wos-session")?.value;
  } catch {
    return null;
  }

  return getFixtureSessionRecord(token)?.session ?? null;
}

export async function resolveFixtureApiAuthContext(options: {
  cookie?: string;
  organizationSlug?: string;
}) {
  if (!isFixtureAuthEnabled()) {
    return null;
  }

  const token = parseFixtureSessionToken(options.cookie);
  const record = getFixtureSessionRecord(token);

  if (!record) {
    return null;
  }

  if (!record || record.onboarding || !record.authContext) {
    return null;
  }

  return switchAuthContextOrganization(record.authContext, options.organizationSlug);
}

export async function createFixtureOnboardingSession() {
  if (!isFixtureAuthEnabled()) {
    throw new Error("fixture_auth_disabled");
  }

  const suffix = randomUUID();
  const workosUserId = `user_${suffix}`;
  const email = `${suffix}@example.com`;

  const user = await syncWorkosUser(db, {
    workosUserId,
    email,
    firstName: "E2E",
    lastName: "Onboarding",
  });

  const sessionToken = `${FIXTURE_SESSION_PREFIX}${randomUUID()}`;

  const session: UserInfo = {
    user: {
      object: "user",
      id: user.workosUserId,
      email: user.email,
      emailVerified: true,
      firstName: "E2E",
      lastName: "Onboarding",
      name: "E2E Onboarding",
      profilePictureUrl: null,
      lastSignInAt: new Date().toISOString(),
      locale: "en",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      externalId: null,
      metadata: {},
    },
    sessionId: `fixture_${sessionToken}`,
    accessToken: `fixture_${sessionToken}`,
  };

  fixtureSessions.set(sessionToken, {
    authContext: null,
    cleanup: {
      workosOrganizationIds: [],
      workosUserIds: [user.workosUserId],
    },
    session,
    onboarding: true,
  });

  return {
    email: user.email,
    sessionToken,
    workosUserId: user.workosUserId,
  };
}

export async function attachOrganizationToFixtureSession(input: {
  sessionToken: string;
  user: {
    workosUserId: string;
    id: string;
    email: string;
  };
  organization: {
    id: string;
    workosOrganizationId: string;
    name: string;
    slug: string | null;
  };
  workosMembershipId: string;
  role?: OrganizationMembershipRole;
}) {
  if (!isFixtureAuthEnabled()) {
    return;
  }

  const record = fixtureSessions.get(input.sessionToken);
  if (!record) {
    return;
  }

  const role = input.role ?? "admin";
  const activeOrganization = {
    workosOrganizationId: input.organization.workosOrganizationId,
    localOrganizationId: input.organization.id,
    name: input.organization.name,
    slug: input.organization.slug,
    membership: withMembershipAccessSource({
      workosMembershipId: input.workosMembershipId,
      role,
    }),
  };

  const authContext = enrichAuthContextWithCapabilities({
    user: {
      workosUserId: input.user.workosUserId,
      localUserId: input.user.id,
      email: input.user.email,
    },
    organizations: [activeOrganization],
    organization: activeOrganization,
    activeOrganization,
    membership: withMembershipAccessSource({
      workosMembershipId: input.workosMembershipId,
      role,
    }),
    activeTeam: null,
  });

  fixtureSessions.set(input.sessionToken, {
    authContext,
    cleanup: {
      ...record.cleanup,
      workosOrganizationIds: [
        ...new Set([
          ...record.cleanup.workosOrganizationIds,
          input.organization.workosOrganizationId,
        ]),
      ],
    },
    onboarding: false,
    session: {
      ...record.session,
      organizationId: input.organization.workosOrganizationId,
    },
  });
}

export async function createFixtureAuthSession(input: { role?: OrganizationMembershipRole }) {
  if (!isFixtureAuthEnabled()) {
    throw new Error("fixture_auth_disabled");
  }

  const identity = createWorkosIdentityWithRole(input.role ?? "admin");
  const { authContext, user, organization } = await syncWorkosIdentityToAuthContext(identity);
  const sessionToken = `${FIXTURE_SESSION_PREFIX}${randomUUID()}`;

  const session: UserInfo = {
    user: {
      object: "user",
      id: user.workosUserId,
      email: user.email,
      emailVerified: true,
      firstName: "E2E",
      lastName: "User",
      name: "E2E User",
      profilePictureUrl: null,
      lastSignInAt: new Date().toISOString(),
      locale: "en",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      externalId: null,
      metadata: {},
    },
    sessionId: `fixture_${sessionToken}`,
    organizationId: organization.workosOrganizationId,
    accessToken: `fixture_${sessionToken}`,
  };

  fixtureSessions.set(sessionToken, {
    authContext,
    cleanup: {
      workosOrganizationIds: [organization.workosOrganizationId],
      workosUserIds: [user.workosUserId],
    },
    session,
    onboarding: false,
  });

  return {
    authContext,
    email: user.email,
    organizationSlug: organization.slug ?? identity.organization.slug ?? "",
    sessionToken,
    workosOrganizationId: organization.workosOrganizationId,
    workosUserId: user.workosUserId,
  };
}
