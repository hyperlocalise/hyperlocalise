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
  if (!value) {
    return fallback;
  }

  // Normalise the value by decoding URI components and lowercasing for consistent checking.
  let decodedValue: string;
  try {
    decodedValue = decodeURIComponent(value);
  } catch {
    // If decoding fails, the URI is likely malformed and should be rejected.
    return fallback;
  }

  if (
    !decodedValue.startsWith("/") ||
    decodedValue.startsWith("//") ||
    decodedValue.startsWith("/\\")
  ) {
    return fallback;
  }

  // Double check the original value as well to be safe.
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }

  // Prevent redirect loops by avoiding sensitive auth routes.
  // We check the path part of the URL (before ? or #) to avoid bypasses.
  const urlPath = decodedValue.split(/[?#]/)[0].toLowerCase();
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
