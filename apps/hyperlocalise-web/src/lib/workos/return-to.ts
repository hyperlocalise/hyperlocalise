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
  const isRestricted = RESTRICTED_PATHS.some(
    (path) => value === path || value.startsWith(`${path}?`) || value.startsWith(`${path}/`),
  );

  if (isRestricted) {
    return fallback;
  }

  return value;
}
