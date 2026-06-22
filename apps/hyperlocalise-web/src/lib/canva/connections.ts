import { and, desc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import {
  generateCanvaConnectionToken,
  getCanvaConnectionTokenPrefix,
  hashCanvaConnectionToken,
} from "./connection-token";
import type { CanvaConnectionSecretResult, CanvaConnectionSummary } from "./types";

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

async function assertProjectBelongsToOrganization(input: {
  organizationId: string;
  projectId: string;
}) {
  const [project] = await db
    .select({ id: schema.projects.id })
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
}): Promise<CanvaConnectionSummary | null> {
  const [connection] = await db
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
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  enabled?: boolean;
}): Promise<CanvaConnectionSecretResult> {
  await assertApiKeyUsableForCanva({
    organizationId: input.organizationId,
    apiKeyId: input.apiKeyId,
  });
  await assertProjectBelongsToOrganization({
    organizationId: input.organizationId,
    projectId: input.projectId,
  });

  const connectionToken = generateCanvaConnectionToken();
  const [connection] = await db
    .insert(schema.canvaConnections)
    .values({
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
      projectId: input.projectId,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      displayName: input.displayName,
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales,
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
  sourceLocale?: string;
  targetLocales?: string[];
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

  if (input.projectId) {
    await assertProjectBelongsToOrganization({
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
  }

  const [connection] = await db
    .update(schema.canvaConnections)
    .set({
      displayName: input.displayName,
      apiKeyId: input.apiKeyId,
      projectId: input.projectId,
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales,
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
}): Promise<CanvaConnectionSecretResult | null> {
  const existing = await getCanvaConnection({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
  });
  if (!existing) {
    return null;
  }

  const connectionToken = generateCanvaConnectionToken();
  const [connection] = await db
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
