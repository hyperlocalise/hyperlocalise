import { signOut } from "@workos-inc/authkit-nextjs";

import { sanitizeReturnTo } from "@/lib/workos/return-to";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const returnTo = sanitizeReturnTo(requestUrl.searchParams.get("returnTo"), "/");

  await signOut({ returnTo });
}
