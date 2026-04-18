import { authkitProxy } from "@workos-inc/authkit-nextjs";

export default authkitProxy();

export const config = {
  matcher: ["/", "/auth/:path", "/dashboard/:path*", "/api/:path*"],
};
