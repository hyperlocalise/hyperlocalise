import { handleAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

import { syncWorkosCallbackUser } from "@/lib/workos/auth";

export const GET = handleAuth({
  returnPathname: "/dashboard",
  onSuccess: async ({ user, organizationId }) => {
    await syncWorkosCallbackUser({ user, organizationId });
  },
  onError: async ({ request }) =>
    NextResponse.redirect(new URL("/auth/access-denied?reason=callback", request.url)),
});
