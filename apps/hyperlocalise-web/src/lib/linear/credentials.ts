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
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { createLinearClient, type LinearClient } from "./client";
import { loadLinearPipesAccessToken, resolveLinearPipesWorkosUserId } from "./pipes";
import type { LinearPipesError } from "./types";

/** Loads a Linear client for the user whose Pipes connection should act. */
export async function loadLinearClient(input: {
  localOrganizationId: string;
  workosUserId?: string | null;
  localUserId?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<Result<{ client: LinearClient; workosUserId: string }, LinearPipesError>> {
  const workosUserId = await resolveLinearPipesWorkosUserId({
    workosUserId: input.workosUserId,
    localUserId: input.localUserId,
  });
  if (!workosUserId) {
    return err({
      code: "linear_not_connected",
      message: "Connect Linear in Integrations before using it.",
    });
  }

  const accessToken = await loadLinearPipesAccessToken({
    localOrganizationId: input.localOrganizationId,
    workosUserId,
  });
  if (isErr(accessToken)) {
    return accessToken;
  }

  return ok({
    workosUserId,
    client: createLinearClient({ accessToken: accessToken.value, fetchImpl: input.fetchImpl }),
  });
}
