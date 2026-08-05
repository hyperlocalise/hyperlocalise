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

/** Hostnames allowed for local `next start` e2e (`NODE_ENV=production` without a Vercel deploy). */
const LOCAL_EMULATOR_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

function readEnv(name: string) {
  // Bracket access avoids Next.js build-time inlining.
  return process.env[name];
}

/**
 * Refuse to boot in a real production deployment when WORKOS_API_HOSTNAME points away from WorkOS.
 *
 * `VERCEL_ENV=production` always rejects overrides. `NODE_ENV=production` alone (as set by
 * `next start` for local e2e) allows only loopback emulator hosts.
 */
export function assertWorkosApiHostnameSafe() {
  const hostname = readEnv("WORKOS_API_HOSTNAME")?.trim();
  if (!hostname || hostname === WORKOS_PRODUCTION_API_HOSTNAME) {
    return;
  }

  const vercelEnv = readEnv("VERCEL_ENV");
  if (vercelEnv === "production") {
    throw new Error(`WORKOS_API_HOSTNAME=${hostname} is not allowed when VERCEL_ENV is production`);
  }

  const nodeEnv = readEnv("NODE_ENV");
  if (nodeEnv === "production" && !LOCAL_EMULATOR_HOSTNAMES.has(hostname)) {
    throw new Error(`WORKOS_API_HOSTNAME=${hostname} is not allowed when NODE_ENV is production`);
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
