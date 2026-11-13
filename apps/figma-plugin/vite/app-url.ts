const LOCAL_HYPERLOCALISE_APP_URL = "http://localhost:3000";
// Apex hyperlocalise.com 307s to www, and CORS preflight requests do not follow redirects.
export const PRODUCTION_HYPERLOCALISE_APP_URL = "https://www.hyperlocalise.com";

/** Baked into the UI bundle at build time via Vite `define`. */
export function hyperlocaliseAppUrlForMode(mode: string): string {
  return mode === "production" ? PRODUCTION_HYPERLOCALISE_APP_URL : LOCAL_HYPERLOCALISE_APP_URL;
}
