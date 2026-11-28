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

import { StoryblokManagementClient } from "./client";
import { isStoryblokRegion } from "./constants";
import { loadStoryblokPipesAccessToken } from "./pipes";

export async function loadStoryblokConnectionWithToken(input: {
  organizationId: string;
  connectionId: string;
}) {
  const [connection] = await db
    .select()
    .from(schema.storyblokConnections)
    .where(
      and(
        eq(schema.storyblokConnections.organizationId, input.organizationId),
        eq(schema.storyblokConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!connection) {
    return null;
  }

  const tokenResult = await loadStoryblokPipesAccessToken({
    localOrganizationId: input.organizationId,
    workosUserId: connection.pipesWorkosUserId,
  });
  if (isErr(tokenResult)) {
    return { connection, token: null as string | null, tokenError: tokenResult.error };
  }

  return { connection, token: tokenResult.value, tokenError: null };
}

/**
 * Loads a connection plus a Management API client for its region. Throws the
 * stable error codes automation runs report when the connection is missing.
 */
export async function loadStoryblokClientForConnection(input: {
  organizationId: string;
  connectionId: string;
}) {
  const loaded = await loadStoryblokConnectionWithToken(input);
  if (!loaded?.token) {
    throw new Error("storyblok_not_connected");
  }
  const region = isStoryblokRegion(loaded.connection.region) ? loaded.connection.region : "eu";
  return {
    connection: loaded.connection,
    client: new StoryblokManagementClient({ accessToken: loaded.token, region }),
  };
}
