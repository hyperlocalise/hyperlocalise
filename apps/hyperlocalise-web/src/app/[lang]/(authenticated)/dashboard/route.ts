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
