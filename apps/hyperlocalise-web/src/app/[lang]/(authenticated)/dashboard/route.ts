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

import { getDefaultOrganizationDashboardPath } from "@/lib/workos/app-auth";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const path = await getDefaultOrganizationDashboardPath({
    staleOrganizationRedirectSearch: requestUrl.search,
  });
  const redirectUrl = new URL(path, requestUrl.origin);

  redirectUrl.search = requestUrl.search;

  return NextResponse.redirect(redirectUrl);
}
