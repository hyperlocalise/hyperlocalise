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
import { cookies } from "next/headers";

import {
  SANITY_OAUTH_REQUEST_COOKIE,
  listSanityOauthConsentConnections,
  parseSanityOauthAuthorizationRequest,
} from "@/lib/sanity/oauth";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { SanityOauthConsentContent } from "./sanity-oauth-consent-content";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "connectSanityOauth");
}

export default async function SanityOauthConsentPage() {
  const auth = await requireAppAuthContext();
  const cookieStore = await cookies();
  const authRequest = parseSanityOauthAuthorizationRequest(
    cookieStore.get(SANITY_OAUTH_REQUEST_COOKIE)?.value ?? "",
  );
  const connections = await listSanityOauthConsentConnections(auth.user.localUserId);

  return (
    <SanityOauthConsentContent
      hasRequest={Boolean(authRequest)}
      connections={connections}
      defaultOrganizationSlug={auth.organization.slug ?? null}
    />
  );
}
