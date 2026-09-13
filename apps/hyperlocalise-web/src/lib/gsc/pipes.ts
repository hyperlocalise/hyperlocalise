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
import { getPipesAccountStatus, loadPipesAccessToken } from "@/lib/pipes/accounts";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { GSC_PIPES_SLUG } from "./constants";
import type { GscPipesError } from "./types";

const PIPES_UNAVAILABLE: GscPipesError = {
  code: "gsc_pipes_unavailable",
  message: "WorkOS is not configured, so Search Console cannot connect through Pipes.",
};

const GSC_NOT_CONNECTED: GscPipesError = {
  code: "gsc_not_connected",
  message: "Connect Google Search Console in Integrations before using it.",
};

const GSC_NEEDS_REAUTHORIZATION: GscPipesError = {
  code: "gsc_pipes_needs_reauthorization",
  message: "Reconnect Google Search Console in Integrations, then try again.",
};

function mapPipesError(code: string): GscPipesError {
  if (code === "pipes_not_connected") {
    return GSC_NOT_CONNECTED;
  }
  if (code === "pipes_needs_reauthorization") {
    return GSC_NEEDS_REAUTHORIZATION;
  }
  return PIPES_UNAVAILABLE;
}

export async function loadGscPipesAccessToken(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<Result<string, GscPipesError>> {
  const result = await loadPipesAccessToken({
    provider: GSC_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(result)) {
    return err(mapPipesError(result.error.code));
  }
  return ok(result.value);
}

export async function getGscPipesConnectionStatus(input: {
  localOrganizationId: string;
  workosUserId: string;
}) {
  return getPipesAccountStatus({
    provider: GSC_PIPES_SLUG,
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
}
