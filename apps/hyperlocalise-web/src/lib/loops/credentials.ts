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

import { createLoopsClient, type LoopsClient } from "./client";
import { loadLoopsPipesApiKey, resolveLoopsPipesWorkosUserId } from "./pipes";
import type { LoopsSettingsError } from "./types";

export async function loadLoopsAutomationClient(input: {
  localOrganizationId: string;
  workosUserId?: string | null;
  localUserId?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<Result<{ client: LoopsClient; workosUserId: string }, LoopsSettingsError>> {
  const workosUserId = await resolveLoopsPipesWorkosUserId({
    workosUserId: input.workosUserId,
    localUserId: input.localUserId,
  });
  if (!workosUserId) {
    return err({
      code: "loops_not_connected",
      message: "Connect Loops in Integrations before using it.",
    });
  }

  const apiKey = await loadLoopsPipesApiKey({
    localOrganizationId: input.localOrganizationId,
    workosUserId,
  });
  if (isErr(apiKey)) {
    return apiKey;
  }

  return ok({
    workosUserId,
    client: createLoopsClient({ apiKey: apiKey.value, fetchImpl: input.fetchImpl }),
  });
}
