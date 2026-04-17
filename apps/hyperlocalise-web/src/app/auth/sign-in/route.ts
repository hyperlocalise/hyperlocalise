import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

import { sanitizeReturnTo } from "@/lib/workos/return-to";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const returnTo = sanitizeReturnTo(requestUrl.searchParams.get("returnTo"), "/dashboard");

  return NextResponse.redirect(await getSignInUrl({ returnTo }));
}
