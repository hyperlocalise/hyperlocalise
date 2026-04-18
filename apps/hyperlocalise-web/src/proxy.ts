import { authkitProxy } from "@workos-inc/authkit-nextjs";

export default authkitProxy();

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
