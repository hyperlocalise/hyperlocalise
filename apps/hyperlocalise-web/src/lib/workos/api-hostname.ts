/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */

/** Default WorkOS API host used when WORKOS_API_HOSTNAME is unset. */
export const WORKOS_PRODUCTION_API_HOSTNAME = "api.workos.com";

function readEnv(name: string) {
  // Bracket access avoids Next.js build-time inlining.
  return process.env[name];
}

/**
 * Refuse to boot in production when WORKOS_API_HOSTNAME points away from WorkOS.
 * The emulator (and any other override) is for local/CI e2e only.
 */
export function assertWorkosApiHostnameSafe() {
  const hostname = readEnv("WORKOS_API_HOSTNAME")?.trim();
  if (!hostname || hostname === WORKOS_PRODUCTION_API_HOSTNAME) {
    return;
  }

  const nodeEnv = readEnv("NODE_ENV");
  const vercelEnv = readEnv("VERCEL_ENV");
  if (nodeEnv === "production" || vercelEnv === "production") {
    throw new Error(
      `WORKOS_API_HOSTNAME=${hostname} is not allowed when NODE_ENV or VERCEL_ENV is production`,
    );
  }
}

export function resolveWorkosApiHostnameOptions() {
  assertWorkosApiHostnameSafe();

  const hostname = readEnv("WORKOS_API_HOSTNAME")?.trim();
  const httpsEnv = readEnv("WORKOS_API_HTTPS")?.trim();
  const portEnv = readEnv("WORKOS_API_PORT")?.trim();

  return {
    apiHostname: hostname || undefined,
    https: httpsEnv === undefined || httpsEnv === "" ? undefined : httpsEnv === "true",
    port: portEnv ? Number.parseInt(portEnv, 10) : undefined,
  };
}
