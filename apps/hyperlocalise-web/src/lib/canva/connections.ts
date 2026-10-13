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
import { and, desc, eq, isNull } from "drizzle-orm";

import { resolveApiKeyTeamAccessContext } from "@/api/auth/api-key-access";
import { buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import { db, schema, type DatabaseClient } from "@/lib/database/client";

import {
  generateCanvaConnectionToken,
  getCanvaConnectionTokenPrefix,
  hashCanvaConnectionToken,
} from "./connection-token";
import type {
  CanvaConnectionSecretResult,
  CanvaConnectionSession,
  CanvaConnectionSummary,
  CanvaSessionProject,
} from "./types";

type CanvaConnectionRow = typeof schema.canvaConnections.$inferSelect;

const REQUIRED_API_KEY_PERMISSIONS = ["files:read", "files:write", "jobs:read", "jobs:write"];

function serializeConnection(connection: CanvaConnectionRow): CanvaConnectionSummary {
  return {
    id: connection.id,
    organizationId: connection.organizationId,
    apiKeyId: connection.apiKeyId,
    projectId: connection.projectId,
    displayName: connection.displayName,
    sourceLocale: connection.sourceLocale,
    targetLocales: connection.targetLocales ?? [],
    canvaBrandId: connection.canvaBrandId,
    connectionTokenPrefix: connection.connectionTokenPrefix,
    enabled: connection.enabled,
    lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

async function assertApiKeyUsableForCanva(input: { organizationId: string; apiKeyId: string }) {
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
    throw new Error("canva_api_key_not_found");
  }

  const missingPermission = REQUIRED_API_KEY_PERMISSIONS.find(
    (permission) => !apiKey.permissions.includes(permission),
  );
  if (missingPermission) {
    throw new Error("canva_api_key_missing_permissions");
  }

  return apiKey;
}

async function loadProjectLocaleSnapshot(input: {
  organizationId: string;
  projectId: string;
}): Promise<{ sourceLocale: string; targetLocales: string[] }> {
  const [project] = await db
    .select({
      id: schema.projects.id,
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!project) {
    throw new Error("canva_project_not_found");
  }

  const sourceLocale = project.sourceLocale?.trim();
  if (!sourceLocale) {
    throw new Error("canva_project_source_locale_missing");
  }

  return {
    sourceLocale,
    targetLocales: project.targetLocales ?? [],
  };
}

function serializeSessionProject(project: {
  id: string;
  name: string;
  sourceLocale: string | null;
  targetLocales: string[] | null;
}): CanvaSessionProject {
  return {
    id: project.id,
    name: project.name,
    sourceLocale: project.sourceLocale ?? "",
    targetLocales: project.targetLocales ?? [],
  };
}

export async function listCanvaAccessibleProjects(input: {
  organizationId: string;
  apiKeyId: string;
}): Promise<CanvaSessionProject[]> {
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

export async function getCanvaConnectionSession(input: {
  organizationId: string;
  connectionId: string;
}): Promise<CanvaConnectionSession> {
  const connection = await getCanvaConnection({
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
    throw new Error("canva_session_not_found");
  }

  const projects = await listCanvaAccessibleProjects({
    organizationId: input.organizationId,
    apiKeyId: connection.apiKeyId,
  });

  let project =
    connection.projectId == null
      ? null
      : (projects.find((entry) => entry.id === connection.projectId) ?? null);

  if (!project && connection.projectId) {
    const [boundProject] = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        sourceLocale: schema.projects.sourceLocale,
        targetLocales: schema.projects.targetLocales,
      })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, connection.projectId),
          eq(schema.projects.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    project = boundProject ? serializeSessionProject(boundProject) : null;
  }

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug ?? null,
    },
    project,
    projects,
    connection: {
      id: connection.id,
      displayName: connection.displayName,
      sourceLocale: connection.sourceLocale,
      targetLocales: connection.targetLocales,
    },
  };
}

export async function bindCanvaConnectionProject(input: {
  organizationId: string;
  connectionId: string;
  projectId: string;
}): Promise<CanvaConnectionSession> {
  const connection = await getCanvaConnection({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
  });
  if (!connection) {
    throw new Error("canva_session_not_found");
  }

  const locales = await loadProjectLocaleSnapshot({
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  const accessible = await listCanvaAccessibleProjects({
    organizationId: input.organizationId,
    apiKeyId: connection.apiKeyId,
  });
  if (!accessible.some((project) => project.id === input.projectId)) {
    throw new Error("canva_project_not_found");
  }

  const [updated] = await db
    .update(schema.canvaConnections)
    .set({
      projectId: input.projectId,
      sourceLocale: locales.sourceLocale,
      targetLocales: locales.targetLocales,
    })
    .where(
      and(
        eq(schema.canvaConnections.organizationId, input.organizationId),
        eq(schema.canvaConnections.id, input.connectionId),
      ),
    )
    .returning({ id: schema.canvaConnections.id });

  if (!updated) {
    throw new Error("canva_session_not_found");
  }

  return getCanvaConnectionSession({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
  });
}

export async function listCanvaConnections(input: {
  organizationId: string;
}): Promise<CanvaConnectionSummary[]> {
  const rows = await db
    .select()
    .from(schema.canvaConnections)
    .where(eq(schema.canvaConnections.organizationId, input.organizationId))
    .orderBy(desc(schema.canvaConnections.createdAt));

  return rows.map(serializeConnection);
}

export async function getCanvaConnection(input: {
  organizationId: string;
  connectionId: string;
  database?: DatabaseClient;
}): Promise<CanvaConnectionSummary | null> {
  const database = input.database ?? db;
  const [connection] = await database
    .select()
    .from(schema.canvaConnections)
    .where(
      and(
        eq(schema.canvaConnections.organizationId, input.organizationId),
        eq(schema.canvaConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  return connection ? serializeConnection(connection) : null;
}

export async function createCanvaConnection(input: {
  organizationId: string;
  userId: string;
  displayName: string;
  apiKeyId: string;
  projectId?: string;
  enabled?: boolean;
}): Promise<CanvaConnectionSecretResult> {
  await assertApiKeyUsableForCanva({
    organizationId: input.organizationId,
    apiKeyId: input.apiKeyId,
  });
  const locales = input.projectId
    ? await loadProjectLocaleSnapshot({
        organizationId: input.organizationId,
        projectId: input.projectId,
      })
    : { sourceLocale: "", targetLocales: [] as string[] };

  const connectionToken = generateCanvaConnectionToken();
  const [connection] = await db
    .insert(schema.canvaConnections)
    .values({
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
      projectId: input.projectId ?? null,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      displayName: input.displayName,
      sourceLocale: locales.sourceLocale,
      targetLocales: locales.targetLocales,
      enabled: input.enabled ?? true,
      connectionTokenHash: hashCanvaConnectionToken(connectionToken),
      connectionTokenPrefix: getCanvaConnectionTokenPrefix(connectionToken),
    })
    .returning();

  if (!connection) {
    throw new Error("canva_connection_create_failed");
  }

  return {
    connection: serializeConnection(connection),
    connectionToken,
  };
}

export async function updateCanvaConnection(input: {
  organizationId: string;
  userId: string;
  connectionId: string;
  displayName?: string;
  apiKeyId?: string;
  projectId?: string;
  enabled?: boolean;
}): Promise<CanvaConnectionSummary | null> {
  const existing = await getCanvaConnection({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
  });
  if (!existing) {
    return null;
  }

  if (input.apiKeyId) {
    await assertApiKeyUsableForCanva({
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
    });
  }

  const nextProjectId = input.projectId !== undefined ? input.projectId : existing.projectId;
  const locales = nextProjectId
    ? await loadProjectLocaleSnapshot({
        organizationId: input.organizationId,
        projectId: nextProjectId,
      })
    : { sourceLocale: "", targetLocales: [] as string[] };

  const [connection] = await db
    .update(schema.canvaConnections)
    .set({
      displayName: input.displayName,
      apiKeyId: input.apiKeyId,
      projectId: input.projectId,
      sourceLocale: locales.sourceLocale,
      targetLocales: locales.targetLocales,
      enabled: input.enabled,
      updatedByUserId: input.userId,
    })
    .where(
      and(
        eq(schema.canvaConnections.organizationId, input.organizationId),
        eq(schema.canvaConnections.id, input.connectionId),
      ),
    )
    .returning();

  return connection ? serializeConnection(connection) : null;
}

export async function deleteCanvaConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<boolean> {
  const [deleted] = await db
    .delete(schema.canvaConnections)
    .where(
      and(
        eq(schema.canvaConnections.organizationId, input.organizationId),
        eq(schema.canvaConnections.id, input.connectionId),
      ),
    )
    .returning({ id: schema.canvaConnections.id });

  return Boolean(deleted);
}

export async function regenerateCanvaConnectionToken(input: {
  organizationId: string;
  userId: string;
  connectionId: string;
  database?: DatabaseClient;
}): Promise<CanvaConnectionSecretResult | null> {
  const database = input.database ?? db;
  const existing = await getCanvaConnection({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
    database,
  });
  if (!existing) {
    return null;
  }

  const connectionToken = generateCanvaConnectionToken();
  const [connection] = await database
    .update(schema.canvaConnections)
    .set({
      connectionTokenHash: hashCanvaConnectionToken(connectionToken),
      connectionTokenPrefix: getCanvaConnectionTokenPrefix(connectionToken),
      canvaBrandId: null,
      updatedByUserId: input.userId,
    })
    .where(
      and(
        eq(schema.canvaConnections.organizationId, input.organizationId),
        eq(schema.canvaConnections.id, input.connectionId),
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

export async function getCanvaConnectionByToken(connectionToken: string) {
  const tokenHash = hashCanvaConnectionToken(connectionToken);
  const [connection] = await db
    .select()
    .from(schema.canvaConnections)
    .where(eq(schema.canvaConnections.connectionTokenHash, tokenHash))
    .limit(1);

  return connection ?? null;
}

function isUniqueViolation(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  if ("code" in error && error.code === "23505") {
    return true;
  }

  const cause = "cause" in error ? error.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

export async function bindCanvaConnectionBrand(input: {
  connectionId: string;
  organizationId: string;
  canvaBrandId: string;
}) {
  try {
    await db.transaction(async (tx) => {
      const [existingBrandConnection] = await tx
        .select({ id: schema.canvaConnections.id })
        .from(schema.canvaConnections)
        .where(
          and(
            eq(schema.canvaConnections.organizationId, input.organizationId),
            eq(schema.canvaConnections.canvaBrandId, input.canvaBrandId),
          ),
        )
        .limit(1);

      if (existingBrandConnection && existingBrandConnection.id !== input.connectionId) {
        throw new Error("canva_brand_already_bound");
      }

      await tx
        .update(schema.canvaConnections)
        .set({
          canvaBrandId: input.canvaBrandId,
          lastUsedAt: new Date(),
        })
        .where(
          and(
            eq(schema.canvaConnections.id, input.connectionId),
            eq(schema.canvaConnections.organizationId, input.organizationId),
            isNull(schema.canvaConnections.canvaBrandId),
          ),
        );
    });
  } catch (error) {
    if (error instanceof Error && error.message === "canva_brand_already_bound") {
      throw error;
    }
    if (isUniqueViolation(error)) {
      throw new Error("canva_brand_already_bound");
    }
    throw error;
  }
}

export async function touchCanvaConnectionUsage(connectionId: string) {
  await db
    .update(schema.canvaConnections)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.canvaConnections.id, connectionId));
}
