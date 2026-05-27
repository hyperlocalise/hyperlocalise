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
    // Normalize the value by decoding URI components.
    const decodedValue = decodeURIComponent(value);

    // Re-verify it still looks like a safe relative path after decoding.
    // We check for // and /\ which can be used for open redirects.
    if (decodedValue.startsWith("//") || decodedValue.startsWith("/\\")) {
      return fallback;
    }

    // Use URL parser to robustly handle the path and parameters.
    const url = new URL(decodedValue, "http://localhost");

    // Ensure it didn't decode into an absolute URL.
    if (url.origin !== "http://localhost") {
      return fallback;
    }

    const urlPath = url.pathname.toLowerCase();

    // Prevent redirect loops by avoiding sensitive auth routes.
    const isRestricted = RESTRICTED_PATHS.some(
      (path) => urlPath === path || urlPath.startsWith(`${path}/`),
    );

    if (isRestricted) {
      // Special case for GitHub installation callback which is restricted but needed.
      if (urlPath === "/auth/github/callback") {
        if (url.searchParams.has("installation_id") && url.searchParams.has("state")) {
          return value;
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
