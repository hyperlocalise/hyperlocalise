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
import { NextResponse } from "next/server";

import { isValidDomainSlug } from "@/lib/localisation-audit/domain-slug";
import {
  claimDomainPathForOrg,
  clearClaimDomainIntent,
  setClaimDomainIntent,
} from "@/lib/linked-domains/claim-intent";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

export async function GET(request: Request, context: { params: Promise<{ domainSlug: string }> }) {
  const { domainSlug } = await context.params;
  const requestUrl = new URL(request.url);

  if (!isValidDomainSlug(domainSlug)) {
    return NextResponse.redirect(new URL("/dashboard", requestUrl.origin));
  }

  await setClaimDomainIntent(domainSlug);

  const auth = await requireAppAuthContext({
    staleOrganizationRedirectSearch: requestUrl.search,
  });
  const organizationSlug = auth.activeOrganization.slug;
  if (!organizationSlug) {
    return NextResponse.redirect(
      new URL("/auth/access-denied?reason=missing-org-slug", requestUrl.origin),
    );
  }

  await clearClaimDomainIntent();
  const path = claimDomainPathForOrg(organizationSlug, domainSlug);
  return NextResponse.redirect(new URL(path, requestUrl.origin));
}
