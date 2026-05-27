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

  try {
    // Normalize the value by decoding URI components and lowercasing for consistent checking.
    const decodedValue = decodeURIComponent(value);
    const urlPath = decodedValue.split(/[?#]/)[0].toLowerCase();

    // Re-verify it still looks like a safe relative path after decoding.
    if (urlPath.startsWith("//") || urlPath.startsWith("/\\")) {
      return fallback;
    }

    // Prevent redirect loops by avoiding sensitive auth routes.
    const isRestricted = RESTRICTED_PATHS.some(
      (path) => urlPath === path || urlPath.startsWith(`${path}/`),
    );

    if (isRestricted) {
      // Special case for GitHub installation callback which is restricted but needed.
      if (urlPath === "/auth/github/callback") {
        const queryIndex = decodedValue.indexOf("?");
        if (queryIndex !== -1) {
          const params = new URLSearchParams(decodedValue.slice(queryIndex + 1));
          if (params.has("installation_id") && params.has("state")) {
            return value;
          }
        }
      }

      return fallback;
    }
  } catch {
    // If decoding fails, the URI is likely malformed and should be rejected.
    return fallback;
  }

  return value;
}
