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

import { normalizeGitLabInstanceOrigin } from "./base-url";
import { getGitLabAuthenticatedUser } from "./client";
import type {
  GitLabConnectionError,
  GitLabConnectionSummary,
  GitLabConnectionWithAccessToken,
} from "./types";

type GitLabConnectionRow = typeof schema.gitlabConnections.$inferSelect;

function serializeConnection(row: GitLabConnectionRow): GitLabConnectionSummary {
  return {
    id: row.id,
    organizationId: row.organizationId,
    displayName: row.displayName,
    baseUrl: row.baseUrl,
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
): Result<string, GitLabConnectionError> {
  const trimmed = accessToken?.trim();
  if (!trimmed) {
    return err({
      code: "gitlab_access_token_required",
      message: "A GitLab personal access token is required.",
    });
  }
  return ok(trimmed);
}

function encryptAccessToken(accessToken: string) {
  return unwrapProviderCredentialCrypto(encryptProviderCredential(accessToken));
}

function decryptAccessToken(row: GitLabConnectionRow): Result<string, GitLabConnectionError> {
  const decrypted = decryptProviderCredential({
    algorithm: row.encryptionAlgorithm,
    keyVersion: row.keyVersion,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
  });
  if (isErr(decrypted)) {
    return err({
      code: "gitlab_connection_decrypt_failed",
      message: "Unable to decrypt GitLab credentials.",
    });
  }

  const accessToken = decrypted.value.trim();
  if (!accessToken) {
    return err({
      code: "gitlab_connection_decrypt_failed",
      message: "Unable to decrypt GitLab credentials.",
    });
  }

  return ok(accessToken);
}

async function validateAccessToken(input: {
  accessToken: string;
  apiOrigin: string;
}): Promise<Result<{ username: string }, GitLabConnectionError>> {
  const result = await getGitLabAuthenticatedUser({
    accessToken: input.accessToken,
    apiOrigin: input.apiOrigin,
  });
  if (isErr(result)) {
    if (result.error.code === "gitlab_unauthorized") {
      return err({
        code: "gitlab_connection_validation_failed",
        message: "GitLab rejected this access token.",
      });
    }
    return err({
      code: "gitlab_connection_validation_failed",
      message: "Unable to reach this GitLab instance with the supplied token.",
    });
  }

  return ok(result.value);
}

export async function listGitLabConnections(input: {
  organizationId: string;
}): Promise<GitLabConnectionSummary[]> {
  const rows = await db
    .select()
    .from(schema.gitlabConnections)
    .where(eq(schema.gitlabConnections.organizationId, input.organizationId))
    .orderBy(desc(schema.gitlabConnections.createdAt));

  return rows.map(serializeConnection);
}

export async function listEnabledGitLabConnections(input: {
  organizationId: string;
}): Promise<GitLabConnectionSummary[]> {
  const connections = await listGitLabConnections(input);
  return connections.filter(
    (connection) => connection.enabled && connection.validationStatus === "valid",
  );
}

export async function getGitLabConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<GitLabConnectionSummary | null> {
  const [row] = await db
    .select()
    .from(schema.gitlabConnections)
    .where(
      and(
        eq(schema.gitlabConnections.organizationId, input.organizationId),
        eq(schema.gitlabConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  return row ? serializeConnection(row) : null;
}

export async function loadGitLabConnectionWithAccessToken(input: {
  organizationId: string;
  connectionId: string;
}): Promise<Result<GitLabConnectionWithAccessToken, GitLabConnectionError>> {
  const [row] = await db
    .select()
    .from(schema.gitlabConnections)
    .where(
      and(
        eq(schema.gitlabConnections.organizationId, input.organizationId),
        eq(schema.gitlabConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!row) {
    return err({
      code: "gitlab_connection_not_found",
      message: "GitLab connection was not found.",
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

export async function createGitLabConnection(input: {
  organizationId: string;
  userId: string;
  displayName: string;
  baseUrl: string;
  accessToken: string;
  enabled?: boolean;
  validate?: boolean;
  db?: DatabaseClient;
}): Promise<Result<GitLabConnectionSummary, GitLabConnectionError>> {
  const originResult = normalizeGitLabInstanceOrigin(input.baseUrl);
  if (isErr(originResult)) {
    return originResult;
  }

  const accessTokenResult = normalizeAccessToken(input.accessToken);
  if (isErr(accessTokenResult)) {
    return accessTokenResult;
  }

  let validationStatus = "unvalidated";
  let validationMessage: string | null = null;
  let lastValidatedAt: Date | null = null;

  if (input.validate !== false) {
    const validation = await validateAccessToken({
      accessToken: accessTokenResult.value,
      apiOrigin: originResult.value,
    });
    if (isErr(validation)) {
      return validation;
    }
    validationStatus = "valid";
    validationMessage = `Connected as ${validation.value.username}.`;
    lastValidatedAt = new Date();
  }

  const encrypted = encryptAccessToken(accessTokenResult.value);
  const database = input.db ?? db;

  try {
    const [row] = await database
      .insert(schema.gitlabConnections)
      .values({
        organizationId: input.organizationId,
        createdByUserId: input.userId,
        updatedByUserId: input.userId,
        displayName: input.displayName.trim(),
        baseUrl: originResult.value,
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
      throw new Error("gitlab_connection_create_failed");
    }

    return ok(serializeConnection(row));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return err({
        code: "gitlab_connection_duplicate",
        message: "This GitLab instance is already connected for the workspace.",
      });
    }
    throw error;
  }
}

export async function updateGitLabConnection(input: {
  organizationId: string;
  userId: string;
  connectionId: string;
  displayName?: string;
  baseUrl?: string;
  accessToken?: string;
  enabled?: boolean;
  validate?: boolean;
  db?: DatabaseClient;
}): Promise<Result<GitLabConnectionSummary | null, GitLabConnectionError>> {
  const database = input.db ?? db;
  const [existing] = await database
    .select()
    .from(schema.gitlabConnections)
    .where(
      and(
        eq(schema.gitlabConnections.organizationId, input.organizationId),
        eq(schema.gitlabConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!existing) {
    return ok(null);
  }

  let nextOrigin = existing.baseUrl;
  if (input.baseUrl !== undefined) {
    const originResult = normalizeGitLabInstanceOrigin(input.baseUrl);
    if (isErr(originResult)) {
      return originResult;
    }
    nextOrigin = originResult.value;
  }

  let nextAccessToken: string | undefined;
  if (input.accessToken !== undefined) {
    const accessTokenResult = normalizeAccessToken(input.accessToken);
    if (isErr(accessTokenResult)) {
      return accessTokenResult;
    }
    nextAccessToken = accessTokenResult.value;
  }

  let validationStatus = existing.validationStatus;
  let validationMessage = existing.validationMessage;
  let lastValidatedAt = existing.lastValidatedAt;

  const shouldValidate =
    input.validate === true ||
    (input.validate !== false && (nextAccessToken !== undefined || input.baseUrl !== undefined));

  if (shouldValidate) {
    const tokenToValidate =
      nextAccessToken ??
      (() => {
        const decrypted = decryptAccessToken(existing);
        return isErr(decrypted) ? null : decrypted.value;
      })();
    if (!tokenToValidate) {
      return err({
        code: "gitlab_connection_decrypt_failed",
        message: "Unable to decrypt GitLab credentials.",
      });
    }

    const validation = await validateAccessToken({
      accessToken: tokenToValidate,
      apiOrigin: nextOrigin,
    });
    if (isErr(validation)) {
      return validation;
    }
    validationStatus = "valid";
    validationMessage = `Connected as ${validation.value.username}.`;
    lastValidatedAt = new Date();
  }

  const encrypted = nextAccessToken ? encryptAccessToken(nextAccessToken) : null;

  try {
    const [row] = await database
      .update(schema.gitlabConnections)
      .set({
        updatedByUserId: input.userId,
        displayName: input.displayName?.trim() ?? existing.displayName,
        baseUrl: nextOrigin,
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
              maskedAccessTokenSuffix: maskProviderCredentialSuffix(nextAccessToken!),
            }
          : {}),
      })
      .where(
        and(
          eq(schema.gitlabConnections.organizationId, input.organizationId),
          eq(schema.gitlabConnections.id, input.connectionId),
        ),
      )
      .returning();

    return ok(row ? serializeConnection(row) : null);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return err({
        code: "gitlab_connection_duplicate",
        message: "This GitLab instance is already connected for the workspace.",
      });
    }
    throw error;
  }
}

export async function lockGitLabConnectionForUpdate(input: {
  organizationId: string;
  connectionId: string;
  db: DatabaseClient;
}): Promise<{
  id: string;
  enabled: boolean;
  validationStatus: GitLabConnectionRow["validationStatus"];
} | null> {
  const [connection] = await input.db
    .select({
      id: schema.gitlabConnections.id,
      enabled: schema.gitlabConnections.enabled,
      validationStatus: schema.gitlabConnections.validationStatus,
    })
    .from(schema.gitlabConnections)
    .where(
      and(
        eq(schema.gitlabConnections.organizationId, input.organizationId),
        eq(schema.gitlabConnections.id, input.connectionId),
      ),
    )
    .limit(1)
    .for("update");

  return connection ?? null;
}

export async function deleteGitLabConnection(input: {
  organizationId: string;
  connectionId: string;
  db?: DatabaseClient;
}): Promise<Result<boolean, GitLabConnectionError>> {
  const run = async (database: DatabaseClient): Promise<Result<boolean, GitLabConnectionError>> => {
    const existing = await lockGitLabConnectionForUpdate({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      db: database,
    });

    if (!existing) {
      return ok(false);
    }

    const deleted = await database
      .delete(schema.gitlabConnections)
      .where(
        and(
          eq(schema.gitlabConnections.organizationId, input.organizationId),
          eq(schema.gitlabConnections.id, input.connectionId),
          sql`not exists (
            select 1
            from ${schema.workspaceAutomations}
            where ${schema.workspaceAutomations.organizationId} = ${input.organizationId}
              and (
                ${schema.workspaceAutomations.toolConfig}->'gitlab'->>'connectionId' = ${input.connectionId}
                or ${schema.workspaceAutomations.repositoryTarget}->>'gitlabConnectionId' = ${input.connectionId}
              )
          )`,
        ),
      )
      .returning({ id: schema.gitlabConnections.id });

    if (deleted.length === 0) {
      return err({
        code: "gitlab_connection_in_use",
        message: "Remove this GitLab connection from automations before deleting it.",
      });
    }

    return ok(true);
  };

  if (input.db) {
    return run(input.db);
  }

  return db.transaction(run);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
