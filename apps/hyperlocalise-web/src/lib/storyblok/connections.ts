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
import { and, desc, eq } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { isStoryblokRegion, type StoryblokRegion } from "./constants";
import {
  discoverStoryblokWithToken,
  validateStoryblokAccessToken,
} from "./discover-storyblok-space";
import { saveStoryblokPipesAccessToken } from "./pipes";
import { loadStoryblokConnectionWithToken } from "./storyblok-connection-access";
import type {
  StoryblokConnectionSummary,
  StoryblokDiscoveryResult,
  StoryblokPipesError,
} from "./types";

type StoryblokConnectionRow = typeof schema.storyblokConnections.$inferSelect;

type StoryblokConnectionError = StoryblokPipesError | { code: string; message: string };

function serializeConnection(connection: StoryblokConnectionRow): StoryblokConnectionSummary {
  return {
    id: connection.id,
    organizationId: connection.organizationId,
    displayName: connection.displayName,
    spaceId: connection.spaceId,
    region: isStoryblokRegion(connection.region) ? connection.region : "eu",
    folderSlugs: connection.folderSlugs ?? [],
    pipesWorkosUserId: connection.pipesWorkosUserId,
    enabled: connection.enabled,
    validationStatus: connection.validationStatus as StoryblokConnectionSummary["validationStatus"],
    validationMessage: connection.validationMessage,
    lastValidatedAt: connection.lastValidatedAt?.toISOString() ?? null,
    maskedTokenSuffix: connection.maskedTokenSuffix,
  };
}

/** Folder slugs are matched as `starts_with` prefixes, so keep them without slashes at the ends. */
export function normalizeStoryblokFolderSlugs(slugs: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const slug of slugs) {
    const trimmed = slug.trim().replace(/^\/+|\/+$/g, "");
    if (trimmed) {
      seen.add(trimmed);
    }
  }
  return [...seen];
}

export async function listStoryblokConnections(input: {
  organizationId: string;
  db?: DatabaseClient;
}): Promise<StoryblokConnectionSummary[]> {
  const database = input.db ?? db;
  const rows = await database
    .select()
    .from(schema.storyblokConnections)
    .where(eq(schema.storyblokConnections.organizationId, input.organizationId))
    .orderBy(desc(schema.storyblokConnections.createdAt));

  return rows.map(serializeConnection);
}

export async function getStoryblokConnection(input: {
  organizationId: string;
  connectionId: string;
  db?: DatabaseClient;
}): Promise<StoryblokConnectionSummary | null> {
  const database = input.db ?? db;
  const [connection] = await database
    .select()
    .from(schema.storyblokConnections)
    .where(
      and(
        eq(schema.storyblokConnections.organizationId, input.organizationId),
        eq(schema.storyblokConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  return connection ? serializeConnection(connection) : null;
}

export async function discoverStoryblokConnection(input: {
  organizationId: string;
  region?: StoryblokRegion | null;
  spaceId?: string | null;
  accessToken?: string | null;
  connectionId?: string | null;
}): Promise<Result<StoryblokDiscoveryResult, StoryblokConnectionError>> {
  let accessToken = input.accessToken?.trim() ?? "";
  let region = input.region ?? null;
  if (!accessToken && input.connectionId) {
    const loaded = await loadStoryblokConnectionWithToken({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
    });
    if (!loaded?.token) {
      return err({
        code: "storyblok_not_connected",
        message: "Reconnect Storyblok with a valid personal access token.",
      });
    }
    accessToken = loaded.token;
    region =
      region ?? (isStoryblokRegion(loaded.connection.region) ? loaded.connection.region : null);
  }

  if (!accessToken) {
    return err({
      code: "storyblok_access_token_required",
      message: "Paste a Storyblok personal access token.",
    });
  }

  const discovery = await discoverStoryblokWithToken({
    accessToken,
    region: region ?? "eu",
    spaceId: input.spaceId,
  });
  if (isErr(discovery)) {
    return err({
      code: "storyblok_discovery_failed",
      message:
        discovery.error.status === 401
          ? "Invalid or expired Storyblok personal access token."
          : discovery.error.status === 0
            ? "Couldn't reach Storyblok in this region. Check the space's region."
            : discovery.error.message,
    });
  }
  return ok(discovery.value);
}

export async function createStoryblokConnection(input: {
  organizationId: string;
  userId: string;
  workosUserId: string;
  workosOrganizationId?: string | null;
  displayName: string;
  spaceId: string;
  region: StoryblokRegion;
  folderSlugs: string[];
  accessToken: string;
  enabled?: boolean;
  db?: DatabaseClient;
}): Promise<Result<StoryblokConnectionSummary, StoryblokConnectionError>> {
  const database = input.db ?? db;

  // Validate before storing so a wrong region, space or plan never leaves a
  // dangling Pipes credential behind.
  const validation = await validateStoryblokAccessToken({
    accessToken: input.accessToken.trim(),
    region: input.region,
    spaceId: input.spaceId,
  });
  if (isErr(validation)) {
    return err({ code: "storyblok_validation_failed", message: validation.error.message });
  }

  const saved = await saveStoryblokPipesAccessToken({
    localOrganizationId: input.organizationId,
    workosUserId: input.workosUserId,
    workosOrganizationId: input.workosOrganizationId,
    accessToken: input.accessToken,
  });
  if (isErr(saved)) {
    return saved;
  }

  const [connection] = await database
    .insert(schema.storyblokConnections)
    .values({
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      displayName: input.displayName,
      spaceId: input.spaceId,
      region: input.region,
      folderSlugs: normalizeStoryblokFolderSlugs(input.folderSlugs),
      pipesWorkosUserId: input.workosUserId,
      enabled: input.enabled ?? true,
      validationStatus: "valid",
      validationMessage: null,
      lastValidatedAt: new Date(),
      maskedTokenSuffix: saved.value.apiKeyLast4 ? `…${saved.value.apiKeyLast4}` : null,
    })
    .returning();

  if (!connection) {
    throw new Error("storyblok_connection_create_failed");
  }

  return ok(serializeConnection(connection));
}

export async function updateStoryblokConnection(input: {
  organizationId: string;
  userId: string;
  workosUserId: string;
  workosOrganizationId?: string | null;
  connectionId: string;
  displayName?: string;
  spaceId?: string;
  region?: StoryblokRegion;
  folderSlugs?: string[];
  accessToken?: string;
  enabled?: boolean;
  db?: DatabaseClient;
}): Promise<Result<StoryblokConnectionSummary | null, StoryblokConnectionError>> {
  const database = input.db ?? db;
  const existing = await getStoryblokConnection({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
    db: database,
  });
  if (!existing) {
    return ok(null);
  }

  let validationStatus = existing.validationStatus;
  let validationMessage = existing.validationMessage;
  let maskedSuffix = existing.maskedTokenSuffix;
  let lastValidatedAt = existing.lastValidatedAt ? new Date(existing.lastValidatedAt) : null;
  let pipesWorkosUserId = existing.pipesWorkosUserId;

  if (input.accessToken?.trim()) {
    const validation = await validateStoryblokAccessToken({
      accessToken: input.accessToken.trim(),
      region: input.region ?? existing.region,
      spaceId: input.spaceId ?? existing.spaceId,
    });
    if (isErr(validation)) {
      return err({ code: "storyblok_validation_failed", message: validation.error.message });
    }

    const saved = await saveStoryblokPipesAccessToken({
      localOrganizationId: input.organizationId,
      workosUserId: input.workosUserId,
      workosOrganizationId: input.workosOrganizationId,
      accessToken: input.accessToken,
    });
    if (isErr(saved)) {
      return saved;
    }
    maskedSuffix = saved.value.apiKeyLast4 ? `…${saved.value.apiKeyLast4}` : maskedSuffix;
    // The token is stored under this Pipes user, so only repoint the
    // reference when a replacement token is saved for them. Otherwise a
    // metadata-only edit by another admin would orphan the stored token.
    pipesWorkosUserId = input.workosUserId;
    validationStatus = "valid";
    validationMessage = null;
    lastValidatedAt = new Date();
  } else if (
    (input.region !== undefined && input.region !== existing.region) ||
    (input.spaceId !== undefined && input.spaceId !== existing.spaceId)
  ) {
    // Moving to another space or region needs a fresh check with the stored token.
    validationStatus = "unvalidated";
    validationMessage = null;
  }

  const [connection] = await database
    .update(schema.storyblokConnections)
    .set({
      updatedByUserId: input.userId,
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.spaceId !== undefined ? { spaceId: input.spaceId } : {}),
      ...(input.region !== undefined ? { region: input.region } : {}),
      ...(input.folderSlugs !== undefined
        ? { folderSlugs: normalizeStoryblokFolderSlugs(input.folderSlugs) }
        : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      validationStatus,
      validationMessage,
      lastValidatedAt,
      maskedTokenSuffix: maskedSuffix,
      pipesWorkosUserId,
    })
    .where(
      and(
        eq(schema.storyblokConnections.organizationId, input.organizationId),
        eq(schema.storyblokConnections.id, input.connectionId),
      ),
    )
    .returning();

  return ok(connection ? serializeConnection(connection) : null);
}

export async function deleteStoryblokConnection(input: {
  organizationId: string;
  connectionId: string;
  db?: DatabaseClient;
}): Promise<boolean> {
  const database = input.db ?? db;
  const deleted = await database
    .delete(schema.storyblokConnections)
    .where(
      and(
        eq(schema.storyblokConnections.organizationId, input.organizationId),
        eq(schema.storyblokConnections.id, input.connectionId),
      ),
    )
    .returning({ id: schema.storyblokConnections.id });

  return deleted.length > 0;
}

export async function validateStoryblokConnectionRecord(input: {
  organizationId: string;
  connectionId: string;
  db?: DatabaseClient;
}): Promise<StoryblokConnectionSummary | null> {
  const database = input.db ?? db;
  const where = and(
    eq(schema.storyblokConnections.organizationId, input.organizationId),
    eq(schema.storyblokConnections.id, input.connectionId),
  );

  const loaded = await loadStoryblokConnectionWithToken({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
  });
  if (!loaded) {
    return null;
  }
  if (!loaded.token) {
    const [connection] = await database
      .update(schema.storyblokConnections)
      .set({
        validationStatus: "needs_reauthorization",
        validationMessage: "Reconnect Storyblok with a valid personal access token.",
        lastValidatedAt: new Date(),
      })
      .where(where)
      .returning();
    return connection ? serializeConnection(connection) : null;
  }

  const validation = await validateStoryblokAccessToken({
    accessToken: loaded.token,
    region: isStoryblokRegion(loaded.connection.region) ? loaded.connection.region : "eu",
    spaceId: loaded.connection.spaceId,
  });

  const [connection] = await database
    .update(schema.storyblokConnections)
    .set({
      validationStatus: isErr(validation) ? "invalid" : "valid",
      validationMessage: isErr(validation) ? validation.error.message : null,
      lastValidatedAt: new Date(),
    })
    .where(where)
    .returning();

  return connection ? serializeConnection(connection) : null;
}
