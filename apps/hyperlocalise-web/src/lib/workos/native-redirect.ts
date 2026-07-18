import { env } from "@/lib/env";

/** Default custom URL scheme used by apps/mac-app ASWebAuthenticationSession. */
export const DEFAULT_NATIVE_REDIRECT_URI = "hyperlocalise://auth/callback";

/**
 * Redirect URIs the Mac (and future native) clients may use for AuthKit PKCE.
 * Always includes the default custom scheme; env may add loopback URIs for local builds.
 */
export function getAllowedNativeRedirectUris(): string[] {
  const fromEnv = env.WORKOS_NATIVE_REDIRECT_URIS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const uris = new Set<string>([DEFAULT_NATIVE_REDIRECT_URI, ...(fromEnv ?? [])]);
  return [...uris];
}

export function isAllowedNativeRedirectUri(redirectUri: string): boolean {
  const normalized = redirectUri.trim();
  if (!normalized) {
    return false;
  }
  return getAllowedNativeRedirectUris().includes(normalized);
}
