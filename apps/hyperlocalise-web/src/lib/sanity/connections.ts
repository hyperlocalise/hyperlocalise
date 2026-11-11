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
import { generateApiKey, getApiKeyPrefix, hashApiKey } from "@/lib/security/api-keys";

import type {
  SanityConnectionSession,
  SanityConnectionSummary,
  SanitySessionProject,
} from "./types";

type SanityConnectionRow = typeof schema.sanityConnections.$inferSelect;

const REQUIRED_API_KEY_PERMISSIONS = ["files:read", "files:write", "jobs:read", "jobs:write"];
const STUDIO_PLUGIN_CONNECTION_NAME = "Sanity Studio plugin";

function serializeConnection(connection: SanityConnectionRow): SanityConnectionSummary {
  return {
    id: connection.id,
    organizationId: connection.organizationId,
    apiKeyId: connection.apiKeyId,
    displayName: connection.displayName,
    enabled: connection.enabled,
    lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export async function assertApiKeyUsableForSanity(input: {
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
    throw new Error("sanity_api_key_not_found");
  }

  const missingPermission = REQUIRED_API_KEY_PERMISSIONS.find(
    (permission) => !apiKey.permissions.includes(permission),
  );
  if (missingPermission) {
    throw new Error("sanity_api_key_missing_permissions");
  }

  return apiKey;
}

function serializeSessionProject(project: {
  id: string;
  name: string;
  sourceLocale: string | null;
  targetLocales: string[] | null;
}): SanitySessionProject {
  return {
    id: project.id,
    name: project.name,
    sourceLocale: project.sourceLocale ?? "",
    targetLocales: project.targetLocales ?? [],
  };
}

export async function listSanityAccessibleProjects(input: {
  organizationId: string;
  apiKeyId: string;
}): Promise<SanitySessionProject[]> {
  try {
    await assertApiKeyUsableForSanity({
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

export async function getSanityConnectionSession(input: {
  organizationId: string;
  connectionId: string;
}): Promise<SanityConnectionSession> {
  const connection = await getSanityConnection({
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
    throw new Error("sanity_session_not_found");
  }

  const projects = await listSanityAccessibleProjects({
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

export async function listSanityConnections(input: {
  organizationId: string;
}): Promise<SanityConnectionSummary[]> {
  const rows = await db
    .select()
    .from(schema.sanityConnections)
    .where(eq(schema.sanityConnections.organizationId, input.organizationId))
    .orderBy(desc(schema.sanityConnections.createdAt));

  return rows.map(serializeConnection);
}

async function createStudioPluginApiKey(input: { organizationId: string; userId: string }) {
  const plainKey = generateApiKey();
  const [apiKey] = await db
    .insert(schema.organizationApiKeys)
    .values({
      organizationId: input.organizationId,
      name: STUDIO_PLUGIN_CONNECTION_NAME,
      keyHash: hashApiKey(plainKey),
      keyPrefix: getApiKeyPrefix(plainKey),
      permissions: [...REQUIRED_API_KEY_PERMISSIONS],
      createdByUserId: input.userId,
    })
    .returning({ id: schema.organizationApiKeys.id });

  if (!apiKey) {
    throw new Error("sanity_api_key_create_failed");
  }

  return apiKey;
}

async function replaceUnusableStudioPluginConnection(input: {
  connection: SanityConnectionSummary;
  userId: string;
}): Promise<SanityConnectionSummary> {
  try {
    await assertApiKeyUsableForSanity({
      organizationId: input.connection.organizationId,
      apiKeyId: input.connection.apiKeyId,
    });
    return input.connection;
  } catch {
    const apiKey = await createStudioPluginApiKey({
      organizationId: input.connection.organizationId,
      userId: input.userId,
    });
    const replaced = await updateSanityConnection({
      organizationId: input.connection.organizationId,
      userId: input.userId,
      connectionId: input.connection.id,
      apiKeyId: apiKey.id,
    });
    if (!replaced) {
      throw new Error("sanity_connection_replace_failed");
    }
    return replaced;
  }
}

export async function ensureSanityStudioPluginConnection(input: {
  organizationId: string;
  userId: string;
  connectionId?: string;
}): Promise<SanityConnectionSummary> {
  const existing = await listSanityConnections({ organizationId: input.organizationId });
  const enabled = input.connectionId
    ? existing.find((connection) => connection.id === input.connectionId && connection.enabled)
    : existing.find((connection) => connection.enabled);
  if (enabled) {
    return replaceUnusableStudioPluginConnection({
      connection: enabled,
      userId: input.userId,
    });
  }

  const apiKey = await createStudioPluginApiKey({
    organizationId: input.organizationId,
    userId: input.userId,
  });
  const created = await createSanityConnection({
    organizationId: input.organizationId,
    userId: input.userId,
    displayName: STUDIO_PLUGIN_CONNECTION_NAME,
    apiKeyId: apiKey.id,
  });
  return created.connection;
}

export async function getSanityConnection(input: {
  organizationId: string;
  connectionId: string;
  database?: DatabaseClient;
}): Promise<SanityConnectionSummary | null> {
  const database = input.database ?? db;
  const [connection] = await database
    .select()
    .from(schema.sanityConnections)
    .where(
      and(
        eq(schema.sanityConnections.organizationId, input.organizationId),
        eq(schema.sanityConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  return connection ? serializeConnection(connection) : null;
}

export async function createSanityConnection(input: {
  organizationId: string;
  userId: string;
  displayName: string;
  apiKeyId: string;
  enabled?: boolean;
}): Promise<{ connection: SanityConnectionSummary }> {
  await assertApiKeyUsableForSanity({
    organizationId: input.organizationId,
    apiKeyId: input.apiKeyId,
  });

  const [connection] = await db
    .insert(schema.sanityConnections)
    .values({
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      displayName: input.displayName,
      enabled: input.enabled ?? true,
    })
    .returning();

  if (!connection) {
    throw new Error("sanity_connection_create_failed");
  }

  return {
    connection: serializeConnection(connection),
  };
}

export async function updateSanityConnection(input: {
  organizationId: string;
  userId: string;
  connectionId: string;
  displayName?: string;
  apiKeyId?: string;
  enabled?: boolean;
}): Promise<SanityConnectionSummary | null> {
  const existing = await getSanityConnection({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
  });
  if (!existing) {
    return null;
  }

  if (input.apiKeyId) {
    await assertApiKeyUsableForSanity({
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
    });
  }

  const [connection] = await db
    .update(schema.sanityConnections)
    .set({
      displayName: input.displayName,
      apiKeyId: input.apiKeyId,
      enabled: input.enabled,
      updatedByUserId: input.userId,
    })
    .where(
      and(
        eq(schema.sanityConnections.organizationId, input.organizationId),
        eq(schema.sanityConnections.id, input.connectionId),
      ),
    )
    .returning();

  return connection ? serializeConnection(connection) : null;
}

export async function deleteSanityConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<boolean> {
  const [deleted] = await db
    .delete(schema.sanityConnections)
    .where(
      and(
        eq(schema.sanityConnections.organizationId, input.organizationId),
        eq(schema.sanityConnections.id, input.connectionId),
      ),
    )
    .returning({ id: schema.sanityConnections.id });

  return Boolean(deleted);
}

export async function touchSanityConnectionUsage(connectionId: string) {
  await db
    .update(schema.sanityConnections)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.sanityConnections.id, connectionId));
}

export async function resolveTeamAccessForSanityConnection(input: {
  organizationId: string;
  apiKeyId: string;
}): Promise<ApiAuthContext | null> {
  try {
    await assertApiKeyUsableForSanity({
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
