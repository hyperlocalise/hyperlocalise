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

import { db, schema, type DatabaseClient } from "@/lib/database";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

import { validateAhrefsApiKey } from "./mcp-client";
import type {
  AhrefsConnectionError,
  AhrefsConnectionSummary,
  AhrefsConnectionWithApiKey,
} from "./types";

type AhrefsConnectionRow = typeof schema.ahrefsConnections.$inferSelect;

function serializeConnection(row: AhrefsConnectionRow): AhrefsConnectionSummary {
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

function normalizeApiKey(apiKey: string | undefined): Result<string, AhrefsConnectionError> {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    return err({
      code: "ahrefs_api_key_required",
      message: "An Ahrefs MCP API key is required.",
    });
  }
  return ok(trimmed);
}

function encryptApiKey(apiKey: string) {
  return unwrapProviderCredentialCrypto(encryptProviderCredential(apiKey));
}

function decryptApiKey(row: AhrefsConnectionRow): Result<string, AhrefsConnectionError> {
  const decrypted = decryptProviderCredential({
    algorithm: row.encryptionAlgorithm,
    keyVersion: row.keyVersion,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
  });
  if (isErr(decrypted)) {
    return err({
      code: "ahrefs_connection_decrypt_failed",
      message: "Unable to decrypt Ahrefs credentials.",
    });
  }

  const apiKey = decrypted.value.trim();
  if (!apiKey) {
    return err({
      code: "ahrefs_connection_decrypt_failed",
      message: "Unable to decrypt Ahrefs credentials.",
    });
  }

  return ok(apiKey);
}

export async function listAhrefsConnections(input: {
  organizationId: string;
}): Promise<AhrefsConnectionSummary[]> {
  const rows = await db
    .select()
    .from(schema.ahrefsConnections)
    .where(eq(schema.ahrefsConnections.organizationId, input.organizationId))
    .orderBy(desc(schema.ahrefsConnections.createdAt));

  return rows.map(serializeConnection);
}

export async function getAhrefsConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<AhrefsConnectionSummary | null> {
  const [row] = await db
    .select()
    .from(schema.ahrefsConnections)
    .where(
      and(
        eq(schema.ahrefsConnections.organizationId, input.organizationId),
        eq(schema.ahrefsConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  return row ? serializeConnection(row) : null;
}

export async function loadAhrefsConnectionWithApiKey(input: {
  organizationId: string;
  connectionId: string;
}): Promise<Result<AhrefsConnectionWithApiKey, AhrefsConnectionError>> {
  const [row] = await db
    .select()
    .from(schema.ahrefsConnections)
    .where(
      and(
        eq(schema.ahrefsConnections.organizationId, input.organizationId),
        eq(schema.ahrefsConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!row) {
    return err({
      code: "ahrefs_connection_not_found",
      message: "Ahrefs connection was not found.",
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

export async function createAhrefsConnection(input: {
  organizationId: string;
  userId: string;
  displayName: string;
  apiKey: string;
  enabled?: boolean;
  validate?: boolean;
  db?: DatabaseClient;
}): Promise<Result<AhrefsConnectionSummary, AhrefsConnectionError>> {
  const apiKeyResult = normalizeApiKey(input.apiKey);
  if (isErr(apiKeyResult)) {
    return apiKeyResult;
  }

  let validationStatus = "unvalidated";
  let validationMessage: string | null = null;
  let lastValidatedAt: Date | null = null;

  // Validate by default so invalid keys never become selectable automation tools.
  if (input.validate !== false) {
    const validation = await validateAhrefsApiKey({ apiKey: apiKeyResult.value });
    if (isErr(validation)) {
      return validation;
    }
    validationStatus = "valid";
    validationMessage = `Connected (${validation.value.toolCount} tools).`;
    lastValidatedAt = new Date();
  }

  const encrypted = encryptApiKey(apiKeyResult.value);
  const database = input.db ?? db;

  const [row] = await database
    .insert(schema.ahrefsConnections)
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
    throw new Error("ahrefs_connection_create_failed");
  }

  return ok(serializeConnection(row));
}

export async function updateAhrefsConnection(input: {
  organizationId: string;
  userId: string;
  connectionId: string;
  displayName?: string;
  apiKey?: string;
  enabled?: boolean;
  validate?: boolean;
  db?: DatabaseClient;
}): Promise<Result<AhrefsConnectionSummary | null, AhrefsConnectionError>> {
  const database = input.db ?? db;
  const [existing] = await database
    .select()
    .from(schema.ahrefsConnections)
    .where(
      and(
        eq(schema.ahrefsConnections.organizationId, input.organizationId),
        eq(schema.ahrefsConnections.id, input.connectionId),
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
      const validation = await validateAhrefsApiKey({ apiKey: apiKeyResult.value });
      if (isErr(validation)) {
        return validation;
      }
      validationStatus = "valid";
      validationMessage = `Connected (${validation.value.toolCount} tools).`;
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
    .update(schema.ahrefsConnections)
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
        eq(schema.ahrefsConnections.organizationId, input.organizationId),
        eq(schema.ahrefsConnections.id, input.connectionId),
      ),
    )
    .returning();

  return ok(row ? serializeConnection(row) : null);
}

/**
 * Lock an Ahrefs connection row for the duration of the current transaction.
 * Callers that write automation references must hold this lock in the same
 * transaction as the insert/update so deletes cannot race ahead.
 */
export async function lockAhrefsConnectionForUpdate(input: {
  organizationId: string;
  connectionId: string;
  db: DatabaseClient;
}): Promise<{
  id: string;
  enabled: boolean;
  validationStatus: AhrefsConnectionRow["validationStatus"];
} | null> {
  const [connection] = await input.db
    .select({
      id: schema.ahrefsConnections.id,
      enabled: schema.ahrefsConnections.enabled,
      validationStatus: schema.ahrefsConnections.validationStatus,
    })
    .from(schema.ahrefsConnections)
    .where(
      and(
        eq(schema.ahrefsConnections.organizationId, input.organizationId),
        eq(schema.ahrefsConnections.id, input.connectionId),
      ),
    )
    .limit(1)
    .for("update");

  return connection ?? null;
}

export async function deleteAhrefsConnection(input: {
  organizationId: string;
  connectionId: string;
  db?: DatabaseClient;
}): Promise<Result<boolean, AhrefsConnectionError>> {
  const run = async (database: DatabaseClient): Promise<Result<boolean, AhrefsConnectionError>> => {
    const existing = await lockAhrefsConnectionForUpdate({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      db: database,
    });

    if (!existing) {
      return ok(false);
    }

    // Conditional delete under the row lock: only succeeds when no automation
    // still references this connectionId.
    const deleted = await database
      .delete(schema.ahrefsConnections)
      .where(
        and(
          eq(schema.ahrefsConnections.organizationId, input.organizationId),
          eq(schema.ahrefsConnections.id, input.connectionId),
          sql`not exists (
            select 1
            from ${schema.workspaceAutomations}
            where ${schema.workspaceAutomations.organizationId} = ${input.organizationId}
              and ${schema.workspaceAutomations.toolConfig}->'ahrefs'->>'connectionId' = ${input.connectionId}
          )`,
        ),
      )
      .returning({ id: schema.ahrefsConnections.id });

    if (deleted.length === 0) {
      return err({
        code: "ahrefs_connection_in_use",
        message: "Remove this Ahrefs connection from automations before deleting it.",
      });
    }

    return ok(true);
  };

  if (input.db) {
    return run(input.db);
  }

  return db.transaction(run);
}
