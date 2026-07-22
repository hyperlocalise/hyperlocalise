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

import { validateSemrushApiKey } from "./mcp-client";
import type {
  SemrushConnectionError,
  SemrushConnectionSummary,
  SemrushConnectionWithApiKey,
} from "./types";

type SemrushConnectionRow = typeof schema.semrushConnections.$inferSelect;

function serializeConnection(row: SemrushConnectionRow): SemrushConnectionSummary {
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

function normalizeApiKey(apiKey: string | undefined): Result<string, SemrushConnectionError> {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    return err({
      code: "semrush_api_key_required",
      message: "A Semrush API key is required.",
    });
  }
  return ok(trimmed);
}

function encryptApiKey(apiKey: string) {
  return unwrapProviderCredentialCrypto(encryptProviderCredential(apiKey));
}

function decryptApiKey(row: SemrushConnectionRow): Result<string, SemrushConnectionError> {
  const decrypted = decryptProviderCredential({
    algorithm: row.encryptionAlgorithm,
    keyVersion: row.keyVersion,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
  });
  if (isErr(decrypted)) {
    return err({
      code: "semrush_connection_decrypt_failed",
      message: "Unable to decrypt Semrush credentials.",
    });
  }

  const apiKey = decrypted.value.trim();
  if (!apiKey) {
    return err({
      code: "semrush_connection_decrypt_failed",
      message: "Unable to decrypt Semrush credentials.",
    });
  }

  return ok(apiKey);
}

export async function listSemrushConnections(input: {
  organizationId: string;
}): Promise<SemrushConnectionSummary[]> {
  const rows = await db
    .select()
    .from(schema.semrushConnections)
    .where(eq(schema.semrushConnections.organizationId, input.organizationId))
    .orderBy(desc(schema.semrushConnections.createdAt));

  return rows.map(serializeConnection);
}

export async function getSemrushConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<SemrushConnectionSummary | null> {
  const [row] = await db
    .select()
    .from(schema.semrushConnections)
    .where(
      and(
        eq(schema.semrushConnections.organizationId, input.organizationId),
        eq(schema.semrushConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  return row ? serializeConnection(row) : null;
}

export async function loadSemrushConnectionWithApiKey(input: {
  organizationId: string;
  connectionId: string;
}): Promise<Result<SemrushConnectionWithApiKey, SemrushConnectionError>> {
  const [row] = await db
    .select()
    .from(schema.semrushConnections)
    .where(
      and(
        eq(schema.semrushConnections.organizationId, input.organizationId),
        eq(schema.semrushConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!row) {
    return err({
      code: "semrush_connection_not_found",
      message: "Semrush connection was not found.",
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

export async function createSemrushConnection(input: {
  organizationId: string;
  userId: string;
  displayName: string;
  apiKey: string;
  enabled?: boolean;
  validate?: boolean;
  db?: DatabaseClient;
}): Promise<Result<SemrushConnectionSummary, SemrushConnectionError>> {
  const apiKeyResult = normalizeApiKey(input.apiKey);
  if (isErr(apiKeyResult)) {
    return apiKeyResult;
  }

  let validationStatus = "unvalidated";
  let validationMessage: string | null = null;
  let lastValidatedAt: Date | null = null;

  // Validate by default so invalid keys never become selectable automation tools.
  if (input.validate !== false) {
    const validation = await validateSemrushApiKey({ apiKey: apiKeyResult.value });
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
    .insert(schema.semrushConnections)
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
    throw new Error("semrush_connection_create_failed");
  }

  return ok(serializeConnection(row));
}

export async function updateSemrushConnection(input: {
  organizationId: string;
  userId: string;
  connectionId: string;
  displayName?: string;
  apiKey?: string;
  enabled?: boolean;
  validate?: boolean;
  db?: DatabaseClient;
}): Promise<Result<SemrushConnectionSummary | null, SemrushConnectionError>> {
  const database = input.db ?? db;
  const [existing] = await database
    .select()
    .from(schema.semrushConnections)
    .where(
      and(
        eq(schema.semrushConnections.organizationId, input.organizationId),
        eq(schema.semrushConnections.id, input.connectionId),
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
      const validation = await validateSemrushApiKey({ apiKey: apiKeyResult.value });
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
    .update(schema.semrushConnections)
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
        eq(schema.semrushConnections.organizationId, input.organizationId),
        eq(schema.semrushConnections.id, input.connectionId),
      ),
    )
    .returning();

  return ok(row ? serializeConnection(row) : null);
}

export async function countAutomationsUsingSemrushConnection(input: {
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
        sql`${schema.workspaceAutomations.toolConfig}->'semrush'->>'connectionId' = ${input.connectionId}`,
      ),
    );

  return rows.length;
}

export async function deleteSemrushConnection(input: {
  organizationId: string;
  connectionId: string;
  db?: DatabaseClient;
}): Promise<Result<boolean, SemrushConnectionError>> {
  const database = input.db ?? db;

  const [existing] = await database
    .select({ id: schema.semrushConnections.id })
    .from(schema.semrushConnections)
    .where(
      and(
        eq(schema.semrushConnections.organizationId, input.organizationId),
        eq(schema.semrushConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!existing) {
    return ok(false);
  }

  const inUseCount = await countAutomationsUsingSemrushConnection({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
    db: database,
  });
  if (inUseCount > 0) {
    return err({
      code: "semrush_connection_in_use",
      message: "Remove this Semrush connection from automations before deleting it.",
    });
  }

  const deleted = await database
    .delete(schema.semrushConnections)
    .where(
      and(
        eq(schema.semrushConnections.organizationId, input.organizationId),
        eq(schema.semrushConnections.id, input.connectionId),
      ),
    )
    .returning({ id: schema.semrushConnections.id });

  return ok(deleted.length > 0);
}
