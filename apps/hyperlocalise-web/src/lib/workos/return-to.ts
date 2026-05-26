const RESTRICTED_PATHS = [
  "/auth/sign-in",
  "/auth/sign-out",
  "/auth/callback",
  "/auth/github/callback",
];

export function sanitizeReturnTo(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }

  // Prevent redirect loops by avoiding sensitive auth routes.
  // We check the path part of the URL (before ? or #) to avoid bypasses.
  const urlPath = value.split(/[?#]/)[0];
  const isRestricted = RESTRICTED_PATHS.some(
    (path) => urlPath === path || urlPath.startsWith(`${path}/`),
  );

  if (isRestricted) {
    if (urlPath === "/auth/github/callback") {
      const queryIndex = value.indexOf("?");
      if (queryIndex !== -1) {
        const params = new URLSearchParams(value.slice(queryIndex + 1));
        if (params.has("installation_id") && params.has("state")) {
          return value;
        }
      }
    }

    return fallback;
  }

  return value;
}
