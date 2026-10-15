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

import { resolveApiKeyTeamAccessContext } from "@/api/auth/api-key-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import { db, schema, type DatabaseClient } from "@/lib/database/client";

import {
  generateFigmaConnectionToken,
  getFigmaConnectionTokenPrefix,
  hashFigmaConnectionToken,
} from "./connection-token";
import type {
  FigmaConnectionSecretResult,
  FigmaConnectionSession,
  FigmaConnectionSummary,
  FigmaSessionProject,
} from "./types";

type FigmaConnectionRow = typeof schema.figmaConnections.$inferSelect;

const REQUIRED_API_KEY_PERMISSIONS = ["files:read", "files:write", "jobs:read", "jobs:write"];

function serializeConnection(connection: FigmaConnectionRow): FigmaConnectionSummary {
  return {
    id: connection.id,
    organizationId: connection.organizationId,
    apiKeyId: connection.apiKeyId,
    displayName: connection.displayName,
    connectionTokenPrefix: connection.connectionTokenPrefix,
    enabled: connection.enabled,
    lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export async function assertApiKeyUsableForFigma(input: {
  organizationId: string;
  apiKeyId: string;
}) {
  const [apiKey] = await db
    .select({
      id: schema.organizationApiKeys.id,
      permissions: schema.organizationApiKeys.permissions,
      revokedAt: schema.organizationApiKeys.revokedAt,
    })
    .from(schema.organizationApiKeys)
    .where(
      and(
        eq(schema.organizationApiKeys.id, input.apiKeyId),
        eq(schema.organizationApiKeys.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!apiKey || apiKey.revokedAt) {
    throw new Error("figma_api_key_not_found");
  }

  const missingPermission = REQUIRED_API_KEY_PERMISSIONS.find(
    (permission) => !apiKey.permissions.includes(permission),
  );
  if (missingPermission) {
    throw new Error("figma_api_key_missing_permissions");
  }

  return apiKey;
}

function serializeSessionProject(project: {
  id: string;
  name: string;
  sourceLocale: string | null;
  targetLocales: string[] | null;
}): FigmaSessionProject {
  return {
    id: project.id,
    name: project.name,
    sourceLocale: project.sourceLocale ?? "",
    targetLocales: project.targetLocales ?? [],
  };
}

export async function listFigmaAccessibleProjects(input: {
  organizationId: string;
  apiKeyId: string;
}): Promise<FigmaSessionProject[]> {
  try {
    await assertApiKeyUsableForFigma({
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
    });
  } catch {
    return [];
  }

  const [apiKey] = await db
    .select({
      id: schema.organizationApiKeys.id,
      createdByUserId: schema.organizationApiKeys.createdByUserId,
    })
    .from(schema.organizationApiKeys)
    .where(
      and(
        eq(schema.organizationApiKeys.id, input.apiKeyId),
        eq(schema.organizationApiKeys.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!apiKey) {
    return [];
  }

  const teamAccess = await resolveApiKeyTeamAccessContext({
    organizationId: input.organizationId,
    createdByUserId: apiKey.createdByUserId,
  });
  if (!teamAccess) {
    return [];
  }

  const accessWhere = await buildAccessibleProjectsWhere(teamAccess);
  const rows = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(and(accessWhere, eq(schema.projects.source, "native")))
    .orderBy(schema.projects.name);

  return rows.map(serializeSessionProject);
}

export async function getFigmaConnectionSession(input: {
  organizationId: string;
  connectionId: string;
}): Promise<FigmaConnectionSession> {
  const connection = await getFigmaConnection({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
  });

  const [organization] = await db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, input.organizationId))
    .limit(1);

  if (!connection || !organization) {
    throw new Error("figma_session_not_found");
  }

  const projects = await listFigmaAccessibleProjects({
    organizationId: input.organizationId,
    apiKeyId: connection.apiKeyId,
  });

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug ?? null,
    },
    projects,
    connection: {
      id: connection.id,
      displayName: connection.displayName,
    },
  };
}

export async function listFigmaConnections(input: {
  organizationId: string;
}): Promise<FigmaConnectionSummary[]> {
  const rows = await db
    .select()
    .from(schema.figmaConnections)
    .where(eq(schema.figmaConnections.organizationId, input.organizationId))
    .orderBy(desc(schema.figmaConnections.createdAt));

  return rows.map(serializeConnection);
}

export async function getFigmaConnection(input: {
  organizationId: string;
  connectionId: string;
  database?: DatabaseClient;
}): Promise<FigmaConnectionSummary | null> {
  const database = input.database ?? db;
  const [connection] = await database
    .select()
    .from(schema.figmaConnections)
    .where(
      and(
        eq(schema.figmaConnections.organizationId, input.organizationId),
        eq(schema.figmaConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  return connection ? serializeConnection(connection) : null;
}

export async function createFigmaConnection(input: {
  organizationId: string;
  userId: string;
  displayName: string;
  apiKeyId: string;
  enabled?: boolean;
}): Promise<FigmaConnectionSecretResult> {
  await assertApiKeyUsableForFigma({
    organizationId: input.organizationId,
    apiKeyId: input.apiKeyId,
  });

  const connectionToken = generateFigmaConnectionToken();
  const [connection] = await db
    .insert(schema.figmaConnections)
    .values({
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      displayName: input.displayName,
      enabled: input.enabled ?? true,
      connectionTokenHash: hashFigmaConnectionToken(connectionToken),
      connectionTokenPrefix: getFigmaConnectionTokenPrefix(connectionToken),
    })
    .returning();

  if (!connection) {
    throw new Error("figma_connection_create_failed");
  }

  return {
    connection: serializeConnection(connection),
    connectionToken,
  };
}

export async function updateFigmaConnection(input: {
  organizationId: string;
  userId: string;
  connectionId: string;
  displayName?: string;
  apiKeyId?: string;
  enabled?: boolean;
}): Promise<FigmaConnectionSummary | null> {
  const existing = await getFigmaConnection({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
  });
  if (!existing) {
    return null;
  }

  if (input.apiKeyId) {
    await assertApiKeyUsableForFigma({
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
    });
  }

  const [connection] = await db
    .update(schema.figmaConnections)
    .set({
      displayName: input.displayName,
      apiKeyId: input.apiKeyId,
      enabled: input.enabled,
      updatedByUserId: input.userId,
    })
    .where(
      and(
        eq(schema.figmaConnections.organizationId, input.organizationId),
        eq(schema.figmaConnections.id, input.connectionId),
      ),
    )
    .returning();

  return connection ? serializeConnection(connection) : null;
}

export async function deleteFigmaConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<boolean> {
  const [deleted] = await db
    .delete(schema.figmaConnections)
    .where(
      and(
        eq(schema.figmaConnections.organizationId, input.organizationId),
        eq(schema.figmaConnections.id, input.connectionId),
      ),
    )
    .returning({ id: schema.figmaConnections.id });

  return Boolean(deleted);
}

export async function regenerateFigmaConnectionToken(input: {
  organizationId: string;
  userId: string;
  connectionId: string;
  database?: DatabaseClient;
}): Promise<FigmaConnectionSecretResult | null> {
  const database = input.database ?? db;
  const existing = await getFigmaConnection({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
    database,
  });
  if (!existing) {
    return null;
  }

  const connectionToken = generateFigmaConnectionToken();
  const [connection] = await database
    .update(schema.figmaConnections)
    .set({
      connectionTokenHash: hashFigmaConnectionToken(connectionToken),
      connectionTokenPrefix: getFigmaConnectionTokenPrefix(connectionToken),
      updatedByUserId: input.userId,
    })
    .where(
      and(
        eq(schema.figmaConnections.organizationId, input.organizationId),
        eq(schema.figmaConnections.id, input.connectionId),
      ),
    )
    .returning();

  if (!connection) {
    return null;
  }

  return {
    connection: serializeConnection(connection),
    connectionToken,
  };
}

export async function getFigmaConnectionByToken(connectionToken: string) {
  const tokenHash = hashFigmaConnectionToken(connectionToken);
  const [connection] = await db
    .select()
    .from(schema.figmaConnections)
    .where(eq(schema.figmaConnections.connectionTokenHash, tokenHash))
    .limit(1);

  return connection ?? null;
}

export async function touchFigmaConnectionUsage(connectionId: string) {
  await db
    .update(schema.figmaConnections)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.figmaConnections.id, connectionId));
}

export async function resolveTeamAccessForFigmaConnection(input: {
  organizationId: string;
  apiKeyId: string;
}): Promise<ApiAuthContext | null> {
  try {
    await assertApiKeyUsableForFigma({
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
    });
  } catch {
    return null;
  }

  const [apiKey] = await db
    .select({
      createdByUserId: schema.organizationApiKeys.createdByUserId,
    })
    .from(schema.organizationApiKeys)
    .where(
      and(
        eq(schema.organizationApiKeys.id, input.apiKeyId),
        eq(schema.organizationApiKeys.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!apiKey?.createdByUserId) {
    return null;
  }

  return resolveApiKeyTeamAccessContext({
    organizationId: input.organizationId,
    createdByUserId: apiKey.createdByUserId,
  });
}
