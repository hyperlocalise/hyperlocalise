import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isFixtureAuthEnabled } from "@/lib/e2e/config";
import { createFixtureAuthSession } from "@/lib/e2e/fixture-auth";
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
  const roleParam = requestUrl.searchParams.get("role") ?? "admin";
  const role = allowedRoles.has(roleParam as OrganizationMembershipRole)
    ? (roleParam as OrganizationMembershipRole)
    : "admin";

  const session = await createFixtureAuthSession({ role });
  const redirectTo =
    sanitizeRedirectPath(requestUrl.searchParams.get("redirect")) ??
    `/en/org/${session.organizationSlug}/dashboard`;

  const cookieStore = await cookies();
  cookieStore.set("wos-session", session.sessionToken, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: false,
  });

  return NextResponse.redirect(new URL(redirectTo, getRequestOrigin(request)));
}
