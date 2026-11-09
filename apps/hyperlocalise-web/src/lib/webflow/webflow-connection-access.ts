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
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { isErr } from "@/lib/primitives/result/results";

import { loadWebflowPipesAccessToken } from "./pipes";

export async function loadWebflowConnectionWithToken(input: {
  organizationId: string;
  connectionId: string;
}) {
  const [connection] = await db
    .select()
    .from(schema.webflowConnections)
    .where(
      and(
        eq(schema.webflowConnections.organizationId, input.organizationId),
        eq(schema.webflowConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!connection) {
    return null;
  }

  const tokenResult = await loadWebflowPipesAccessToken({
    localOrganizationId: input.organizationId,
    workosUserId: connection.pipesWorkosUserId,
  });
  if (isErr(tokenResult)) {
    return { connection, token: null as string | null, tokenError: tokenResult.error };
  }

  return { connection, token: tokenResult.value, tokenError: null };
}
