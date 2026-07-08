import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  isFixtureAuthCookieSecure,
  isFixtureAuthEnabled,
  verifyE2eSetupToken,
} from "@/lib/e2e/config";
import { createFixtureAuthSession, createFixtureOnboardingSession } from "@/lib/e2e/fixture-auth";
import type { OrganizationMembershipRole } from "@/lib/database/types";

const allowedRoles = new Set<OrganizationMembershipRole>([
  "admin",
  "localization_manager",
  "developer",
  "reviewer",
  "translator",
  "member",
]);

function sanitizeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

function getRequestOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (host) {
    const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    return `${protocol}://${host}`;
  }

  return url.origin;
}

export async function GET(request: Request) {
  if (!isFixtureAuthEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const setupToken = requestUrl.searchParams.get("setup_token");
  if (!verifyE2eSetupToken(setupToken)) {
    return new NextResponse(null, { status: 404 });
  }

  const roleParam = requestUrl.searchParams.get("role") ?? "admin";
  const role = allowedRoles.has(roleParam as OrganizationMembershipRole)
    ? (roleParam as OrganizationMembershipRole)
    : "admin";

  const mode = requestUrl.searchParams.get("mode");
  const redirectParam = sanitizeRedirectPath(requestUrl.searchParams.get("redirect"));
  const secure = isFixtureAuthCookieSecure(request);

  if (mode === "onboarding") {
    const session = await createFixtureOnboardingSession();
    const redirectTo = redirectParam ?? "/auth/onboarding";

    const cookieStore = await cookies();
    cookieStore.set("wos-session", session.sessionToken, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure,
    });

    return NextResponse.redirect(new URL(redirectTo, getRequestOrigin(request)));
  }

  const session = await createFixtureAuthSession({ role });
  const redirectTo = redirectParam ?? `/en/org/${session.organizationSlug}/dashboard`;

  const cookieStore = await cookies();
  cookieStore.set("wos-session", session.sessionToken, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure,
  });

  return NextResponse.redirect(new URL(redirectTo, getRequestOrigin(request)));
}
