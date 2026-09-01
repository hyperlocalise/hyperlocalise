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
  CANVA_OAUTH_REQUEST_COOKIE,
  listCanvaOauthConsentConnections,
  parseCanvaOauthAuthorizationRequest,
} from "@/lib/canva/oauth";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { CanvaOauthConsentContent } from "./canva-oauth-consent-content";

export default async function CanvaOauthConsentPage() {
  const auth = await requireAppAuthContext();
  const cookieStore = await cookies();
  const authRequest = parseCanvaOauthAuthorizationRequest(
    cookieStore.get(CANVA_OAUTH_REQUEST_COOKIE)?.value ?? "",
  );
  const connections = await listCanvaOauthConsentConnections(auth.user.localUserId);

  return (
    <CanvaOauthConsentContent
      hasRequest={Boolean(authRequest)}
      connections={connections}
      defaultOrganizationSlug={auth.organization.slug ?? null}
    />
  );
}
