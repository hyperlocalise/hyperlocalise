/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { NextResponse } from "next/server";

import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { sanitizeReturnTo } from "@/lib/workos/return-to";
import { setStoredActiveOrganizationSlug } from "@/lib/workos/active-organization";

type OrganizationSelectRouteProps = {
  params: Promise<{
    organizationSlug: string;
  }>;
};

export async function GET(request: Request, { params }: OrganizationSelectRouteProps) {
  const requestUrl = new URL(request.url);
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  if (!auth.activeOrganization.slug) {
    return NextResponse.redirect(
      new URL("/auth/access-denied?reason=missing-org-slug", request.url),
    );
  }

  await setStoredActiveOrganizationSlug(auth.activeOrganization.slug);

  const returnTo = sanitizeReturnTo(
    requestUrl.searchParams.get("returnTo"),
    `/org/${auth.activeOrganization.slug}/dashboard`,
  );

  return NextResponse.redirect(
    new URL(
      returnTo === "/dashboard" ? `/org/${auth.activeOrganization.slug}/dashboard` : returnTo,
      request.url,
    ),
  );
}
