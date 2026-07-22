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
import {
  withAuth as workosWithAuth,
  type NoUserInfo,
  type UserInfo,
} from "@workos-inc/authkit-nextjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { resolveFixtureAuthSession } from "@/lib/e2e/fixture-auth";
import { REQUEST_URL_HEADER } from "@/lib/workos/request-url-header";
import { sanitizeReturnTo } from "@/lib/workos/return-to";

type WithAuthOptions = Parameters<typeof workosWithAuth>[0];

/**
 * Redirect unauthenticated users through `/auth/sign-in` (a Route Handler).
 *
 * Do not call WorkOS `withAuth({ ensureSignedIn: true })` from Server Components.
 * That path runs `redirectToSignIn()` → `setPKCECookie()` via `cookies().set()`,
 * which throws in Next.js 15+/16:
 * "Cookies can only be modified in a Server Action or Route Handler".
 *
 * WorkOS guidance: set PKCE cookies only from a Server Action or Route Handler
 * (see workos/skills authkit-nextjs hardening for Server Component cookie violations).
 *
 * `REQUEST_URL_HEADER` (`x-url`) is set by `proxy.ts` on every continued request
 * so returnTo can recover the protected org/project URL after sign-in.
 */
async function redirectToAppSignIn(): Promise<never> {
  const headersList = await headers();
  const requestUrl = headersList.get(REQUEST_URL_HEADER);
  const returnPathname = requestUrl
    ? (() => {
        try {
          const url = new URL(requestUrl);
          return `${url.pathname}${url.search}`;
        } catch {
          return "/dashboard";
        }
      })()
    : "/dashboard";
  const returnTo = sanitizeReturnTo(returnPathname, "/dashboard");

  redirect(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
}

export async function withAuth(options?: WithAuthOptions): Promise<UserInfo | NoUserInfo> {
  const fixtureSession = await resolveFixtureAuthSession();

  if (fixtureSession) {
    if (options?.ensureSignedIn && !fixtureSession.user) {
      await redirectToAppSignIn();
    }

    return fixtureSession;
  }

  // Never forward ensureSignedIn to WorkOS — handle it via the sign-in route instead.
  const session = await workosWithAuth();

  if (options?.ensureSignedIn && !session.user) {
    await redirectToAppSignIn();
  }

  return session;
}
