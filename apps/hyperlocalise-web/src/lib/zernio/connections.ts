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
import { and, desc, eq, sql } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

import { validateZernioApiKey } from "./client";
import type {
  ZernioConnectionError,
  ZernioConnectionSummary,
  ZernioConnectionWithApiKey,
} from "./types";

type ZernioConnectionRow = typeof schema.zernioConnections.$inferSelect;

function serializeConnection(row: ZernioConnectionRow): ZernioConnectionSummary {
  return {
    id: row.id,
    organizationId: row.organizationId,
    displayName: row.displayName,
    enabled: row.enabled,
    validationStatus: row.validationStatus,
    validationMessage: row.validationMessage,
    lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
    maskedApiKeySuffix: row.maskedApiKeySuffix,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeApiKey(apiKey: string | undefined): Result<string, ZernioConnectionError> {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    return err({
      code: "zernio_api_key_required",
      message: "A Zernio API key is required.",
    });
  }
  return ok(trimmed);
}

function encryptApiKey(apiKey: string) {
  return unwrapProviderCredentialCrypto(encryptProviderCredential(apiKey));
}

function decryptApiKey(row: ZernioConnectionRow): Result<string, ZernioConnectionError> {
  const decrypted = decryptProviderCredential({
    algorithm: row.encryptionAlgorithm,
    keyVersion: row.keyVersion,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
  });
  if (isErr(decrypted)) {
    return err({
      code: "zernio_connection_decrypt_failed",
      message: "Unable to decrypt Zernio credentials.",
    });
  }

  const apiKey = decrypted.value.trim();
  if (!apiKey) {
    return err({
      code: "zernio_connection_decrypt_failed",
      message: "Unable to decrypt Zernio credentials.",
    });
  }

  return ok(apiKey);
}

export async function listZernioConnections(input: {
  organizationId: string;
}): Promise<ZernioConnectionSummary[]> {
  const rows = await db
    .select()
    .from(schema.zernioConnections)
    .where(eq(schema.zernioConnections.organizationId, input.organizationId))
    .orderBy(desc(schema.zernioConnections.createdAt));

  return rows.map(serializeConnection);
}

export async function getZernioConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<ZernioConnectionSummary | null> {
  const [row] = await db
    .select()
    .from(schema.zernioConnections)
    .where(
      and(
        eq(schema.zernioConnections.organizationId, input.organizationId),
        eq(schema.zernioConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  return row ? serializeConnection(row) : null;
}

export async function loadZernioConnectionWithApiKey(input: {
  organizationId: string;
  connectionId: string;
}): Promise<Result<ZernioConnectionWithApiKey, ZernioConnectionError>> {
  const [row] = await db
    .select()
    .from(schema.zernioConnections)
    .where(
      and(
        eq(schema.zernioConnections.organizationId, input.organizationId),
        eq(schema.zernioConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!row) {
    return err({
      code: "zernio_connection_not_found",
      message: "Zernio connection was not found.",
    });
  }

  const apiKeyResult = decryptApiKey(row);
  if (isErr(apiKeyResult)) {
    return apiKeyResult;
  }

  return ok({
    connection: serializeConnection(row),
    apiKey: apiKeyResult.value,
  });
}

export async function resolveZernioConnectionWithApiKey(input: {
  organizationId: string;
  connectionId?: string;
}): Promise<Result<ZernioConnectionWithApiKey, ZernioConnectionError>> {
  if (input.connectionId) {
    return loadZernioConnectionWithApiKey({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
    });
  }

  const connections = await listZernioConnections({ organizationId: input.organizationId });
  const usable = connections.filter(
    (connection) => connection.enabled && connection.validationStatus === "valid",
  );

  if (usable.length === 0) {
    return err({
      code: "zernio_connection_not_found",
      message: "Connect Zernio in Integrations before using ads tools.",
    });
  }

  if (usable.length > 1) {
    return err({
      code: "zernio_connection_ambiguous",
      message: "Choose a Zernio connection. This organization has more than one.",
    });
  }

  return loadZernioConnectionWithApiKey({
    organizationId: input.organizationId,
    connectionId: usable[0]!.id,
  });
}

export async function createZernioConnection(input: {
  organizationId: string;
  userId: string;
  displayName: string;
  apiKey: string;
  enabled?: boolean;
  validate?: boolean;
  db?: DatabaseClient;
}): Promise<Result<ZernioConnectionSummary, ZernioConnectionError>> {
  const apiKeyResult = normalizeApiKey(input.apiKey);
  if (isErr(apiKeyResult)) {
    return apiKeyResult;
  }

  let validationStatus = "unvalidated";
  let validationMessage: string | null = null;
  let lastValidatedAt: Date | null = null;

  if (input.validate !== false) {
    const validation = await validateZernioApiKey({ apiKey: apiKeyResult.value });
    if (isErr(validation)) {
      return validation;
    }
    validationStatus = "valid";
    validationMessage = `Connected (${validation.value.accountCount} accounts).`;
    lastValidatedAt = new Date();
  }

  const encrypted = encryptApiKey(apiKeyResult.value);
  const database = input.db ?? db;

  const [row] = await database
    .insert(schema.zernioConnections)
    .values({
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      displayName: input.displayName.trim(),
      enabled: input.enabled ?? true,
      validationStatus,
      validationMessage,
      lastValidatedAt,
      encryptionAlgorithm: encrypted.algorithm,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      maskedApiKeySuffix: maskProviderCredentialSuffix(apiKeyResult.value),
    })
    .returning();

  if (!row) {
    throw new Error("zernio_connection_create_failed");
  }

  return ok(serializeConnection(row));
}

export async function updateZernioConnection(input: {
  organizationId: string;
  userId: string;
  connectionId: string;
  displayName?: string;
  apiKey?: string;
  enabled?: boolean;
  validate?: boolean;
  db?: DatabaseClient;
}): Promise<Result<ZernioConnectionSummary | null, ZernioConnectionError>> {
  const database = input.db ?? db;
  const [existing] = await database
    .select()
    .from(schema.zernioConnections)
    .where(
      and(
        eq(schema.zernioConnections.organizationId, input.organizationId),
        eq(schema.zernioConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!existing) {
    return ok(null);
  }

  let encrypted: ReturnType<typeof encryptApiKey> | null = null;
  let maskedApiKeySuffix = existing.maskedApiKeySuffix;
  let validationStatus = existing.validationStatus;
  let validationMessage = existing.validationMessage;
  let lastValidatedAt = existing.lastValidatedAt;

  if (input.apiKey !== undefined) {
    const apiKeyResult = normalizeApiKey(input.apiKey);
    if (isErr(apiKeyResult)) {
      return apiKeyResult;
    }

    if (input.validate !== false) {
      const validation = await validateZernioApiKey({ apiKey: apiKeyResult.value });
      if (isErr(validation)) {
        return validation;
      }
      validationStatus = "valid";
      validationMessage = `Connected (${validation.value.accountCount} accounts).`;
      lastValidatedAt = new Date();
    } else {
      validationStatus = "unvalidated";
      validationMessage = null;
      lastValidatedAt = null;
    }

    encrypted = encryptApiKey(apiKeyResult.value);
    maskedApiKeySuffix = maskProviderCredentialSuffix(apiKeyResult.value);
  }

  const [row] = await database
    .update(schema.zernioConnections)
    .set({
      updatedByUserId: input.userId,
      displayName: input.displayName?.trim() ?? existing.displayName,
      enabled: input.enabled ?? existing.enabled,
      validationStatus,
      validationMessage,
      lastValidatedAt,
      ...(encrypted
        ? {
            encryptionAlgorithm: encrypted.algorithm,
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            keyVersion: encrypted.keyVersion,
            maskedApiKeySuffix,
          }
        : {}),
    })
    .where(
      and(
        eq(schema.zernioConnections.organizationId, input.organizationId),
        eq(schema.zernioConnections.id, input.connectionId),
      ),
    )
    .returning();

  return ok(row ? serializeConnection(row) : null);
}

export async function countAutomationsUsingZernioConnection(input: {
  organizationId: string;
  connectionId: string;
  db?: DatabaseClient;
}): Promise<number> {
  const database = input.db ?? db;
  const rows = await database
    .select({ id: schema.workspaceAutomations.id })
    .from(schema.workspaceAutomations)
    .where(
      and(
        eq(schema.workspaceAutomations.organizationId, input.organizationId),
        sql`${schema.workspaceAutomations.toolConfig}->'zernio'->>'connectionId' = ${input.connectionId}`,
      ),
    );

  return rows.length;
}

/**
 * Lock a Zernio connection row for the duration of the current transaction.
 * Callers that write automation references must hold this lock in the same
 * transaction as the insert/update so deletes cannot race ahead.
 */
export async function lockZernioConnectionForUpdate(input: {
  organizationId: string;
  connectionId: string;
  db: DatabaseClient;
}): Promise<{
  id: string;
  enabled: boolean;
  validationStatus: ZernioConnectionRow["validationStatus"];
} | null> {
  const [connection] = await input.db
    .select({
      id: schema.zernioConnections.id,
      enabled: schema.zernioConnections.enabled,
      validationStatus: schema.zernioConnections.validationStatus,
    })
    .from(schema.zernioConnections)
    .where(
      and(
        eq(schema.zernioConnections.organizationId, input.organizationId),
        eq(schema.zernioConnections.id, input.connectionId),
      ),
    )
    .limit(1)
    .for("update");

  return connection ?? null;
}

export async function deleteZernioConnection(input: {
  organizationId: string;
  connectionId: string;
  db?: DatabaseClient;
}): Promise<Result<boolean, ZernioConnectionError>> {
  const run = async (database: DatabaseClient): Promise<Result<boolean, ZernioConnectionError>> => {
    const existing = await lockZernioConnectionForUpdate({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      db: database,
    });

    if (!existing) {
      return ok(false);
    }

    const deleted = await database
      .delete(schema.zernioConnections)
      .where(
        and(
          eq(schema.zernioConnections.organizationId, input.organizationId),
          eq(schema.zernioConnections.id, input.connectionId),
          sql`not exists (
            select 1
            from ${schema.workspaceAutomations}
            where ${schema.workspaceAutomations.organizationId} = ${input.organizationId}
              and ${schema.workspaceAutomations.toolConfig}->'zernio'->>'connectionId' = ${input.connectionId}
          )`,
        ),
      )
      .returning({ id: schema.zernioConnections.id });

    if (deleted.length === 0) {
      return err({
        code: "zernio_connection_in_use",
        message: "Remove this Zernio connection from automations before deleting it.",
      });
    }

    return ok(true);
  };

  if (input.db) {
    return run(input.db);
  }

  return db.transaction(run);
}
