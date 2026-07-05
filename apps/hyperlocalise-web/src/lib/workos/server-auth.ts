import {
  withAuth as workosWithAuth,
  type NoUserInfo,
  type UserInfo,
} from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import { resolveFixtureAuthSession } from "@/lib/e2e/fixture-auth";

type WithAuthOptions = Parameters<typeof workosWithAuth>[0];

export async function withAuth(options?: WithAuthOptions): Promise<UserInfo | NoUserInfo> {
  const fixtureSession = await resolveFixtureAuthSession();

  if (fixtureSession) {
    if (options?.ensureSignedIn && !fixtureSession.user) {
      redirect("/auth/sign-in");
    }

    return fixtureSession;
  }

  return workosWithAuth(options);
}
