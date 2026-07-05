import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import type { UserInfo } from "@workos-inc/authkit-nextjs";

import type { ApiAuthContext } from "@/api/auth/workos";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import {
  createWorkosIdentityWithRole,
  switchAuthContextOrganization,
  syncWorkosIdentityToAuthContext,
} from "@/test/auth-seed";

import { FIXTURE_SESSION_PREFIX, isFixtureAuthEnabled, isFixtureSessionToken } from "./config";

type FixtureSessionRecord = {
  authContext: ApiAuthContext;
  session: UserInfo;
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

export async function resolveFixtureAuthSession(): Promise<UserInfo | null> {
  if (!isFixtureAuthEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("wos-session")?.value;

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

  return switchAuthContextOrganization(record.authContext, options.organizationSlug);
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

  fixtureSessions.set(sessionToken, { authContext, session });

  return {
    authContext,
    email: user.email,
    organizationSlug: organization.slug ?? identity.organization.slug ?? "",
    sessionToken,
    workosOrganizationId: organization.workosOrganizationId,
    workosUserId: user.workosUserId,
  };
}

export function clearFixtureAuthSessions() {
  fixtureSessions.clear();
}
