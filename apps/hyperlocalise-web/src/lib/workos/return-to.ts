const RESTRICTED_PATHS = [
  "/auth/sign-in",
  "/auth/sign-out",
  "/auth/callback",
  "/auth/github/callback",
  "/auth/select-organization",
  "/auth/onboarding",
  "/auth/access-denied",
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
    return fallback;
  }

  return value;
}
