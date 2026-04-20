import { authkitProxy } from "@workos-inc/authkit-nextjs";

export default authkitProxy();

export const config = {
  matcher: ["/", "/org/:path*", "/auth/:path*", "/dashboard/:path*", "/api/:path*"],
};
