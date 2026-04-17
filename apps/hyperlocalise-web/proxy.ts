import { authkitProxy } from "@workos-inc/authkit-nextjs";

export const proxy = authkitProxy({
  middlewareAuth: {
    enabled: false,
    unauthenticatedPaths: ["/auth/callback", "/auth/access-denied"],
  },
  signUpPaths: [],
  eagerAuth: false,
});

export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*", "/api/:path*"],
};
