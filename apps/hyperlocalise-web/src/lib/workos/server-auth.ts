import {
  withAuth as workosWithAuth,
  type NoUserInfo,
  type UserInfo,
} from "@workos-inc/authkit-nextjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { resolveFixtureAuthSession } from "@/lib/e2e/fixture-auth";
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
 */
async function redirectToAppSignIn(): Promise<never> {
  const headersList = await headers();
  const requestUrl = headersList.get("x-url");
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
