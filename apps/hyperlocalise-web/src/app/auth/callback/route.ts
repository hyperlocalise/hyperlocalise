import { handleAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

export const GET = handleAuth({
  returnPathname: "/dashboard",
  onError: async ({ request }) =>
    NextResponse.redirect(new URL("/auth/access-denied?reason=callback", request.url)),
});
