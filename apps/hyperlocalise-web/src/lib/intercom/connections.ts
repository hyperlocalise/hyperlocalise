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

import { db, schema, type DatabaseClient } from "@/lib/database";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

import { validateIntercomAccessToken } from "./client";
import { isIntercomRestEndpoint, type IntercomRestEndpoint } from "./constants";
import type {
  IntercomConnectionError,
  IntercomConnectionSummary,
  IntercomConnectionWithAccessToken,
} from "./types";

type IntercomConnectionRow = typeof schema.intercomConnections.$inferSelect;

function serializeConnection(row: IntercomConnectionRow): IntercomConnectionSummary {
  if (!isIntercomRestEndpoint(row.restEndpoint)) {
    throw new Error("intercom_rest_endpoint_corrupt");
  }

  return {
    id: row.id,
    organizationId: row.organizationId,
    displayName: row.displayName,
    restEndpoint: row.restEndpoint,
    enabled: row.enabled,
    validationStatus: row.validationStatus,
    validationMessage: row.validationMessage,
    lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
    maskedAccessTokenSuffix: row.maskedAccessTokenSuffix,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeAccessToken(
  accessToken: string | undefined,
): Result<string, IntercomConnectionError> {
  const trimmed = accessToken?.trim();
  if (!trimmed) {
    return err({
      code: "intercom_access_token_required",
      message: "An Intercom access token is required.",
    });
  }
  return ok(trimmed);
}

function normalizeRestEndpoint(
  restEndpoint: string | undefined,
): Result<IntercomRestEndpoint, IntercomConnectionError> {
  const trimmed = restEndpoint?.trim();
  if (!trimmed || !isIntercomRestEndpoint(trimmed)) {
    return err({
      code: "intercom_rest_endpoint_invalid",
      message: "Choose a valid Intercom REST endpoint (US, Europe, or Australia).",
    });
  }
  return ok(trimmed);
}

function encryptAccessToken(accessToken: string) {
  return unwrapProviderCredentialCrypto(encryptProviderCredential(accessToken));
}

function decryptAccessToken(row: IntercomConnectionRow): Result<string, IntercomConnectionError> {
  const decrypted = decryptProviderCredential({
    algorithm: row.encryptionAlgorithm,
    keyVersion: row.keyVersion,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
  });
  if (isErr(decrypted)) {
    return err({
      code: "intercom_connection_decrypt_failed",
      message: "Unable to decrypt Intercom credentials.",
    });
  }

  const accessToken = decrypted.value.trim();
  if (!accessToken) {
    return err({
      code: "intercom_connection_decrypt_failed",
      message: "Unable to decrypt Intercom credentials.",
    });
  }

  return ok(accessToken);
}

function validationSuccessMessage(appName: string | null): string {
  return appName ? `Connected to ${appName}.` : "Connected.";
}

export async function listIntercomConnections(input: {
  organizationId: string;
}): Promise<IntercomConnectionSummary[]> {
  const rows = await db
    .select()
    .from(schema.intercomConnections)
    .where(eq(schema.intercomConnections.organizationId, input.organizationId))
    .orderBy(desc(schema.intercomConnections.createdAt));

  return rows.map(serializeConnection);
}

export async function getIntercomConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<IntercomConnectionSummary | null> {
  const [row] = await db
    .select()
    .from(schema.intercomConnections)
    .where(
      and(
        eq(schema.intercomConnections.organizationId, input.organizationId),
        eq(schema.intercomConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  return row ? serializeConnection(row) : null;
}

export async function loadIntercomConnectionWithAccessToken(input: {
  organizationId: string;
  connectionId: string;
}): Promise<Result<IntercomConnectionWithAccessToken, IntercomConnectionError>> {
  const [row] = await db
    .select()
    .from(schema.intercomConnections)
    .where(
      and(
        eq(schema.intercomConnections.organizationId, input.organizationId),
        eq(schema.intercomConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!row) {
    return err({
      code: "intercom_connection_not_found",
      message: "Intercom connection was not found.",
    });
  }

  const accessTokenResult = decryptAccessToken(row);
  if (isErr(accessTokenResult)) {
    return accessTokenResult;
  }

  return ok({
    connection: serializeConnection(row),
    accessToken: accessTokenResult.value,
  });
}

export async function createIntercomConnection(input: {
  organizationId: string;
  userId: string;
  displayName: string;
  accessToken: string;
  restEndpoint: string;
  enabled?: boolean;
  validate?: boolean;
  db?: DatabaseClient;
}): Promise<Result<IntercomConnectionSummary, IntercomConnectionError>> {
  const accessTokenResult = normalizeAccessToken(input.accessToken);
  if (isErr(accessTokenResult)) {
    return accessTokenResult;
  }

  const restEndpointResult = normalizeRestEndpoint(input.restEndpoint);
  if (isErr(restEndpointResult)) {
    return restEndpointResult;
  }

  let validationStatus = "unvalidated";
  let validationMessage: string | null = null;
  let lastValidatedAt: Date | null = null;

  if (input.validate !== false) {
    const validation = await validateIntercomAccessToken({
      accessToken: accessTokenResult.value,
      restEndpoint: restEndpointResult.value,
    });
    if (isErr(validation)) {
      return validation;
    }
    validationStatus = "valid";
    validationMessage = validationSuccessMessage(validation.value.appName);
    lastValidatedAt = new Date();
  }

  const encrypted = encryptAccessToken(accessTokenResult.value);
  const database = input.db ?? db;

  const [row] = await database
    .insert(schema.intercomConnections)
    .values({
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      displayName: input.displayName.trim(),
      restEndpoint: restEndpointResult.value,
      enabled: input.enabled ?? true,
      validationStatus,
      validationMessage,
      lastValidatedAt,
      encryptionAlgorithm: encrypted.algorithm,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      maskedAccessTokenSuffix: maskProviderCredentialSuffix(accessTokenResult.value),
    })
    .returning();

  if (!row) {
    throw new Error("intercom_connection_create_failed");
  }

  return ok(serializeConnection(row));
}

export async function updateIntercomConnection(input: {
  organizationId: string;
  userId: string;
  connectionId: string;
  displayName?: string;
  accessToken?: string;
  restEndpoint?: string;
  enabled?: boolean;
  validate?: boolean;
  db?: DatabaseClient;
}): Promise<Result<IntercomConnectionSummary | null, IntercomConnectionError>> {
  const database = input.db ?? db;
  const [existing] = await database
    .select()
    .from(schema.intercomConnections)
    .where(
      and(
        eq(schema.intercomConnections.organizationId, input.organizationId),
        eq(schema.intercomConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!existing) {
    return ok(null);
  }

  let encrypted: ReturnType<typeof encryptAccessToken> | null = null;
  let maskedAccessTokenSuffix = existing.maskedAccessTokenSuffix;
  let validationStatus = existing.validationStatus;
  let validationMessage = existing.validationMessage;
  let lastValidatedAt = existing.lastValidatedAt;
  let accessTokenForValidation: string | null = null;

  const restEndpointResult =
    input.restEndpoint !== undefined
      ? normalizeRestEndpoint(input.restEndpoint)
      : normalizeRestEndpoint(existing.restEndpoint);
  if (isErr(restEndpointResult)) {
    return restEndpointResult;
  }

  if (input.accessToken !== undefined) {
    const accessTokenResult = normalizeAccessToken(input.accessToken);
    if (isErr(accessTokenResult)) {
      return accessTokenResult;
    }
    encrypted = encryptAccessToken(accessTokenResult.value);
    maskedAccessTokenSuffix = maskProviderCredentialSuffix(accessTokenResult.value);
    accessTokenForValidation = accessTokenResult.value;
  }

  const shouldRevalidate =
    input.accessToken !== undefined ||
    (input.restEndpoint !== undefined && input.restEndpoint !== existing.restEndpoint);

  if (shouldRevalidate) {
    if (input.validate !== false) {
      if (!accessTokenForValidation) {
        const decrypted = decryptAccessToken(existing);
        if (isErr(decrypted)) {
          return decrypted;
        }
        accessTokenForValidation = decrypted.value;
      }

      const validation = await validateIntercomAccessToken({
        accessToken: accessTokenForValidation,
        restEndpoint: restEndpointResult.value,
      });
      if (isErr(validation)) {
        return validation;
      }
      validationStatus = "valid";
      validationMessage = validationSuccessMessage(validation.value.appName);
      lastValidatedAt = new Date();
    } else {
      validationStatus = "unvalidated";
      validationMessage = null;
      lastValidatedAt = null;
    }
  }

  const [row] = await database
    .update(schema.intercomConnections)
    .set({
      updatedByUserId: input.userId,
      displayName: input.displayName?.trim() ?? existing.displayName,
      restEndpoint: restEndpointResult.value,
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
            maskedAccessTokenSuffix,
          }
        : {}),
    })
    .where(
      and(
        eq(schema.intercomConnections.organizationId, input.organizationId),
        eq(schema.intercomConnections.id, input.connectionId),
      ),
    )
    .returning();

  return ok(row ? serializeConnection(row) : null);
}

export async function deleteIntercomConnection(input: {
  organizationId: string;
  connectionId: string;
  db?: DatabaseClient;
}): Promise<boolean> {
  const database = input.db ?? db;
  const deleted = await database
    .delete(schema.intercomConnections)
    .where(
      and(
        eq(schema.intercomConnections.organizationId, input.organizationId),
        eq(schema.intercomConnections.id, input.connectionId),
      ),
    )
    .returning({ id: schema.intercomConnections.id });

  return deleted.length > 0;
}
