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
import { NotFoundException } from "@workos-inc/node";

import { err, ok, type Result } from "@/lib/primitives/result/results";
import { getWorkosServerClient } from "@/lib/workos/server-client";

import type { PipesProviderSlug } from "./providers";
import type { PipesStatusError } from "./types";

const PIPES_UNAVAILABLE: PipesStatusError = {
  code: "pipes_unavailable",
  message: "WorkOS is not configured, so this provider cannot connect through Pipes.",
};

export type PipesProviderAvailability = {
  workosConfigured: boolean;
  providerConfigured: boolean;
  providerEnabled: boolean;
};

function isNotFound(error: unknown): boolean {
  return error instanceof NotFoundException;
}

export function isWorkosPipesConfigured(): boolean {
  return getWorkosServerClient() !== null;
}

export async function getWorkosPipesProviderAvailability(
  provider: PipesProviderSlug,
): Promise<Result<PipesProviderAvailability, PipesStatusError>> {
  if (!isWorkosPipesConfigured()) {
    return ok({
      workosConfigured: false,
      providerConfigured: false,
      providerEnabled: false,
    });
  }

  const workos = getWorkosServerClient();
  if (!workos) {
    return ok({
      workosConfigured: false,
      providerConfigured: false,
      providerEnabled: false,
    });
  }

  try {
    const integration = await workos.pipes.getDataIntegration({ slug: provider });
    return ok({
      workosConfigured: true,
      providerConfigured: true,
      providerEnabled: Boolean(integration.enabled),
    });
  } catch (error) {
    if (isNotFound(error)) {
      return ok({
        workosConfigured: true,
        providerConfigured: false,
        providerEnabled: false,
      });
    }
    return err(PIPES_UNAVAILABLE);
  }
}

export function isPipesProviderConnectable(availability: PipesProviderAvailability): boolean {
  return (
    availability.workosConfigured && availability.providerConfigured && availability.providerEnabled
  );
}
