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
import { isErr, ok, type Result } from "@/lib/primitives/result/results";

import { validateWebflowAccessToken } from "./discover-webflow-site";
import { loadWebflowPipesAccessToken, saveWebflowPipesSiteToken } from "./pipes";
import type { WebflowConnectionSummary, WebflowDiscoveryResult, WebflowPipesError } from "./types";

type WebflowConnectionRow = typeof schema.webflowConnections.$inferSelect;

function serializeConnection(connection: WebflowConnectionRow): WebflowConnectionSummary {
  return {
    id: connection.id,
    organizationId: connection.organizationId,
    displayName: connection.displayName,
    siteId: connection.siteId,
    collectionIds: connection.collectionIds ?? [],
    pipesWorkosUserId: connection.pipesWorkosUserId,
    enabled: connection.enabled,
    validationStatus: connection.validationStatus as WebflowConnectionSummary["validationStatus"],
    validationMessage: connection.validationMessage,
    lastValidatedAt: connection.lastValidatedAt?.toISOString() ?? null,
    maskedTokenSuffix: connection.maskedTokenSuffix,
  };
}

export async function listWebflowConnections(input: {
  organizationId: string;
  db?: DatabaseClient;
}): Promise<WebflowConnectionSummary[]> {
  const database = input.db ?? db;
  const rows = await database
    .select()
    .from(schema.webflowConnections)
    .where(eq(schema.webflowConnections.organizationId, input.organizationId))
    .orderBy(desc(schema.webflowConnections.createdAt));

  return rows.map(serializeConnection);
}

export async function getWebflowConnection(input: {
  organizationId: string;
  connectionId: string;
  db?: DatabaseClient;
}): Promise<WebflowConnectionSummary | null> {
  const database = input.db ?? db;
  const [connection] = await database
    .select()
    .from(schema.webflowConnections)
    .where(
      and(
        eq(schema.webflowConnections.organizationId, input.organizationId),
        eq(schema.webflowConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  return connection ? serializeConnection(connection) : null;
}

export async function discoverWebflowConnection(input: {
  organizationId: string;
  workosUserId: string;
  siteId?: string | null;
  siteToken?: string | null;
  connectionId?: string | null;
}): Promise<Result<WebflowDiscoveryResult, { code: string; message: string; status?: number }>> {
  let accessToken = input.siteToken?.trim() ?? "";
  if (!accessToken && input.connectionId) {
    const loaded = await loadWebflowConnectionWithTokenInternal({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
    });
    if (!loaded?.token) {
      return ok({
        sites: [],
        site: null,
        collections: [],
        locales: null,
        scopes: {
          sitesRead: false,
          cmsRead: false,
          cmsWrite: false,
          componentsRead: false,
        },
      });
    }
    accessToken = loaded.token;
  }

  if (!accessToken) {
    return ok({
      sites: [],
      site: null,
      collections: [],
      locales: null,
      scopes: {
        sitesRead: false,
        cmsRead: false,
        cmsWrite: false,
        componentsRead: false,
      },
    });
  }

  const validation = await validateWebflowAccessToken({
    accessToken,
    siteId: input.siteId?.trim() || "",
  });
  if (isErr(validation)) {
    return ok({
      sites: [],
      site: null,
      collections: [],
      locales: null,
      scopes: {
        sitesRead: validation.error.status !== 401,
        cmsRead: false,
        cmsWrite: false,
        componentsRead: false,
      },
    });
  }

  return ok(validation.value.discovery);
}

async function loadWebflowConnectionWithTokenInternal(input: {
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
    return null;
  }
  return { connection, token: tokenResult.value };
}

export async function createWebflowConnection(input: {
  organizationId: string;
  userId: string;
  workosUserId: string;
  workosOrganizationId?: string | null;
  displayName: string;
  siteId: string;
  collectionIds: string[];
  siteToken: string;
  enabled?: boolean;
  db?: DatabaseClient;
}): Promise<
  Result<WebflowConnectionSummary, WebflowPipesError | { code: string; message: string }>
> {
  const database = input.db ?? db;

  const saved = await saveWebflowPipesSiteToken({
    localOrganizationId: input.organizationId,
    workosUserId: input.workosUserId,
    workosOrganizationId: input.workosOrganizationId,
    siteToken: input.siteToken,
  });
  if (isErr(saved)) {
    return saved;
  }

  const validation = await validateWebflowAccessToken({
    accessToken: input.siteToken.trim(),
    siteId: input.siteId,
  });
  const validationStatus = isErr(validation) ? "invalid" : "valid";
  const validationMessage = isErr(validation) ? validation.error.message : null;
  const maskedSuffix = saved.value.apiKeyLast4 ? `…${saved.value.apiKeyLast4}` : null;

  const [connection] = await database
    .insert(schema.webflowConnections)
    .values({
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      displayName: input.displayName,
      siteId: input.siteId,
      collectionIds: input.collectionIds,
      pipesWorkosUserId: input.workosUserId,
      enabled: input.enabled ?? true,
      validationStatus,
      validationMessage,
      lastValidatedAt: validationStatus === "valid" ? new Date() : null,
      maskedTokenSuffix: maskedSuffix,
    })
    .returning();

  if (!connection) {
    throw new Error("webflow_connection_create_failed");
  }

  return ok(serializeConnection(connection));
}

export async function updateWebflowConnection(input: {
  organizationId: string;
  userId: string;
  workosUserId: string;
  workosOrganizationId?: string | null;
  connectionId: string;
  displayName?: string;
  siteId?: string;
  collectionIds?: string[];
  siteToken?: string;
  enabled?: boolean;
  db?: DatabaseClient;
}): Promise<WebflowConnectionSummary | null> {
  const database = input.db ?? db;
  const existing = await getWebflowConnection({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
    db: database,
  });
  if (!existing) {
    return null;
  }

  let validationStatus = existing.validationStatus;
  let validationMessage = existing.validationMessage;
  let maskedSuffix = existing.maskedTokenSuffix;
  let lastValidatedAt = existing.lastValidatedAt ? new Date(existing.lastValidatedAt) : null;
  let pipesWorkosUserId = existing.pipesWorkosUserId;

  if (input.siteToken?.trim()) {
    const saved = await saveWebflowPipesSiteToken({
      localOrganizationId: input.organizationId,
      workosUserId: input.workosUserId,
      workosOrganizationId: input.workosOrganizationId,
      siteToken: input.siteToken,
    });
    if (isErr(saved)) {
      throw new Error(saved.error.code);
    }
    maskedSuffix = saved.value.apiKeyLast4 ? `…${saved.value.apiKeyLast4}` : maskedSuffix;
    // The token is stored under this Pipes user, so only repoint the
    // reference when a replacement token is saved for them. Otherwise a
    // metadata-only edit by another admin would orphan the stored token.
    pipesWorkosUserId = input.workosUserId;

    const validation = await validateWebflowAccessToken({
      accessToken: input.siteToken.trim(),
      siteId: input.siteId ?? existing.siteId,
    });
    validationStatus = isErr(validation) ? "invalid" : "valid";
    validationMessage = isErr(validation) ? validation.error.message : null;
    lastValidatedAt = validationStatus === "valid" ? new Date() : null;
  }

  const [connection] = await database
    .update(schema.webflowConnections)
    .set({
      updatedByUserId: input.userId,
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.siteId !== undefined ? { siteId: input.siteId } : {}),
      ...(input.collectionIds !== undefined ? { collectionIds: input.collectionIds } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      validationStatus,
      validationMessage,
      lastValidatedAt,
      maskedTokenSuffix: maskedSuffix,
      pipesWorkosUserId,
    })
    .where(
      and(
        eq(schema.webflowConnections.organizationId, input.organizationId),
        eq(schema.webflowConnections.id, input.connectionId),
      ),
    )
    .returning();

  return connection ? serializeConnection(connection) : null;
}

export async function deleteWebflowConnection(input: {
  organizationId: string;
  connectionId: string;
  db?: DatabaseClient;
}): Promise<boolean> {
  const database = input.db ?? db;
  const deleted = await database
    .delete(schema.webflowConnections)
    .where(
      and(
        eq(schema.webflowConnections.organizationId, input.organizationId),
        eq(schema.webflowConnections.id, input.connectionId),
      ),
    )
    .returning({ id: schema.webflowConnections.id });

  return deleted.length > 0;
}

export async function validateWebflowConnectionRecord(input: {
  organizationId: string;
  connectionId: string;
  db?: DatabaseClient;
}): Promise<WebflowConnectionSummary | null> {
  const loaded = await loadWebflowConnectionWithTokenInternal({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
  });
  if (!loaded?.token) {
    const database = input.db ?? db;
    const [connection] = await database
      .update(schema.webflowConnections)
      .set({
        validationStatus: "needs_reauthorization",
        validationMessage: "Reconnect Webflow with a valid site token.",
        lastValidatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.webflowConnections.organizationId, input.organizationId),
          eq(schema.webflowConnections.id, input.connectionId),
        ),
      )
      .returning();
    return connection ? serializeConnection(connection) : null;
  }

  const validation = await validateWebflowAccessToken({
    accessToken: loaded.token,
    siteId: loaded.connection.siteId,
  });

  const database = input.db ?? db;
  const [connection] = await database
    .update(schema.webflowConnections)
    .set({
      validationStatus: isErr(validation) ? "invalid" : "valid",
      validationMessage: isErr(validation) ? validation.error.message : null,
      lastValidatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.webflowConnections.organizationId, input.organizationId),
        eq(schema.webflowConnections.id, input.connectionId),
      ),
    )
    .returning();

  return connection ? serializeConnection(connection) : null;
}
