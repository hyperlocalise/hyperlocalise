import { env } from "@/lib/env";

export { AUTUMN_API_PATH_PREFIX, ORGANIZATION_SLUG_HEADER } from "./autumn-public-config";

/**
 * Resolves the Autumn secret key. The app stores `AUTUMN_API_KEY`; Autumn's SDK
 * also accepts `AUTUMN_SECRET_KEY`, which we mirror when a key is configured.
 */
export function getAutumnSecretKey(): string | undefined {
  return env.AUTUMN_API_KEY ?? process.env.AUTUMN_SECRET_KEY;
}

export function isAutumnConfigured(): boolean {
  return Boolean(getAutumnSecretKey());
}
