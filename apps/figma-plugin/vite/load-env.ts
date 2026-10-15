import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";

const pluginRootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const LOCAL_HYPERLOCALISE_APP_URL = "http://localhost:3000";
export const PRODUCTION_HYPERLOCALISE_APP_URL = "https://app.hyperlocalise.com";

/** Baked into the UI bundle at build time via Vite `define`. */
export function resolveHyperlocaliseAppUrlForBuild(options?: {
  isVitest?: boolean;
  envUrl?: string;
}): string {
  const isVitest = options?.isVitest ?? Boolean(process.env.VITEST);
  if (isVitest) {
    return LOCAL_HYPERLOCALISE_APP_URL;
  }

  if (options && "envUrl" in options) {
    const fromOptions = options.envUrl?.trim();
    return fromOptions || PRODUCTION_HYPERLOCALISE_APP_URL;
  }

  loadDotenv({ path: path.join(pluginRootDir, ".env") });

  const fromEnv = process.env.HYPERLOCALISE_APP_URL?.trim();
  return fromEnv || PRODUCTION_HYPERLOCALISE_APP_URL;
}
