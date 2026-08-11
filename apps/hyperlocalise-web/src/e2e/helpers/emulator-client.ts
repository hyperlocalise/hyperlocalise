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
import { WorkOS } from "@workos-inc/node";

import type { OrganizationMembershipRole } from "@/lib/database/types";
import { membershipRoleToWorkosRoleSlug } from "@/lib/workos/membership-role";

const DEFAULT_EMULATOR_HOSTNAME = "localhost";
const DEFAULT_EMULATOR_PORT = 4100;
const DEFAULT_API_KEY = "sk_test_default";
const DEFAULT_CLIENT_ID = "client_emulator_e2e";

export function getEmulatorBaseUrl() {
  const hostname = process.env.WORKOS_API_HOSTNAME?.trim() || DEFAULT_EMULATOR_HOSTNAME;
  const https = process.env.WORKOS_API_HTTPS === "true";
  const port = process.env.WORKOS_API_PORT
    ? Number.parseInt(process.env.WORKOS_API_PORT, 10)
    : DEFAULT_EMULATOR_PORT;
  const protocol = https ? "https" : "http";
  return `${protocol}://${hostname}${port ? `:${port}` : ""}`;
}

export function createEmulatorWorkosClient() {
  const apiKey = process.env.WORKOS_API_KEY?.trim() || DEFAULT_API_KEY;
  const clientId = process.env.WORKOS_CLIENT_ID?.trim() || DEFAULT_CLIENT_ID;
  const hostname = process.env.WORKOS_API_HOSTNAME?.trim() || DEFAULT_EMULATOR_HOSTNAME;
  const https = process.env.WORKOS_API_HTTPS === "true";
  const port = process.env.WORKOS_API_PORT
    ? Number.parseInt(process.env.WORKOS_API_PORT, 10)
    : DEFAULT_EMULATOR_PORT;

  return new WorkOS(apiKey, {
    clientId,
    apiHostname: hostname,
    https,
    port,
  });
}

export async function assertEmulatorReady() {
  const healthUrl = new URL("/health", getEmulatorBaseUrl());
  const response = await fetch(healthUrl);
  if (!response.ok) {
    throw new Error(
      `workos-emulate is not healthy at ${healthUrl} (status ${response.status}). Start it with \`vp run e2e:emulator\`.`,
    );
  }
}

export function roleSlugForE2e(role: OrganizationMembershipRole) {
  return membershipRoleToWorkosRoleSlug(role);
}
