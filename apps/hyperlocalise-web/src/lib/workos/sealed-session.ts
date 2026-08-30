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
import type { withAuth } from "@/lib/workos/server-auth";
import { getWorkosAuthKitConfig } from "@/lib/workos/config";
import { getWorkosServerClient } from "@/lib/workos/server-client";

type WorkosSessionUser = NonNullable<Awaited<ReturnType<typeof withAuth>>["user"]>;

export type AuthenticatedSealedSession = {
  user: WorkosSessionUser;
  organizationId?: string;
};

type SealedAuthenticateResult = {
  authenticated: boolean;
  reason?: string;
  user?: WorkosSessionUser;
  organizationId?: string;
  accessToken?: string;
};

type SealedRefreshResult = {
  authenticated: boolean;
  user?: WorkosSessionUser;
  session?: { user?: WorkosSessionUser; organizationId?: string; accessToken?: string };
  organizationId?: string;
};

function readJwtSubject(accessToken: string): string | null {
  const [, payload] = accessToken.split(".");
  if (!payload) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: unknown;
    };
    return typeof decoded.sub === "string" ? decoded.sub : null;
  } catch {
    return null;
  }
}

function bindSessionUser(input: {
  user?: WorkosSessionUser;
  organizationId?: string;
  accessToken?: string;
}): AuthenticatedSealedSession | null {
  if (!input.user) {
    return null;
  }

  if (input.accessToken) {
    const subject = readJwtSubject(input.accessToken);
    if (subject && input.user.id !== subject) {
      return null;
    }
  }

  return {
    user: input.user,
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
  };
}

/**
 * Verify a sealed WorkOS `wos-session` value from a client that cannot send
 * cookies. This is the same sealed session AuthKit issues for web and Mac —
 * not a separate identity token. Figma plugin requests use personal access
 * tokens via `x-api-key` instead.
 */
export async function authenticateSealedWorkosSession(
  sealedSession: string,
): Promise<AuthenticatedSealedSession | null> {
  const trimmed = sealedSession.trim();
  const config = getWorkosAuthKitConfig();
  const workos = getWorkosServerClient();
  if (!trimmed || !config || !workos) {
    return null;
  }

  const cookieSession = workos.userManagement.loadSealedSession({
    sessionData: trimmed,
    cookiePassword: config.cookiePassword,
  });

  let authenticated = (await cookieSession.authenticate()) as SealedAuthenticateResult;
  if (!authenticated.authenticated) {
    if (authenticated.reason !== "invalid_jwt") {
      return null;
    }

    const refreshed = (await cookieSession.refresh()) as SealedRefreshResult;
    if (!refreshed.authenticated) {
      return null;
    }

    return bindSessionUser({
      user: refreshed.user ?? refreshed.session?.user,
      organizationId: refreshed.organizationId ?? refreshed.session?.organizationId,
      accessToken: refreshed.session?.accessToken,
    });
  }

  return bindSessionUser({
    user: authenticated.user,
    organizationId: authenticated.organizationId,
    accessToken: authenticated.accessToken,
  });
}
