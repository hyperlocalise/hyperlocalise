import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";

const pluginRootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const DEFAULT_HYPERLOCALISE_APP_URL = "http://localhost:3000";

/** Baked into the UI bundle at build time via Vite `define`. */
export function resolveHyperlocaliseAppUrlForBuild(): string {
  if (process.env.VITEST) {
    return DEFAULT_HYPERLOCALISE_APP_URL;
  }

  loadDotenv({ path: path.join(pluginRootDir, ".env") });

  const fromEnv = process.env.HYPERLOCALISE_APP_URL?.trim();
  return fromEnv || DEFAULT_HYPERLOCALISE_APP_URL;
}
