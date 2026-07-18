import { and, desc, eq } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import { formatSsrfGuardError, validatePublicHttpUrl } from "@/lib/security/ssrf-guard";

import type {
  McpServerAuthKind,
  McpServerAuthSecret,
  McpServerConnectionError,
  McpServerConnectionSummary,
  McpServerConnectionWithSecret,
  McpServerTransport,
} from "./types";

type McpServerConnectionRow = typeof schema.mcpServerConnections.$inferSelect;

const EMPTY_SECRET_MASK = "••••none";

function serializeConnection(row: McpServerConnectionRow): McpServerConnectionSummary {
  return {
    id: row.id,
    organizationId: row.organizationId,
    displayName: row.displayName,
    serverUrl: row.serverUrl,
    transport: row.transport as McpServerTransport,
    authKind: row.authKind as McpServerAuthKind,
    enabled: row.enabled,
    validationStatus: row.validationStatus,
    validationMessage: row.validationMessage,
    lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
    maskedTokenSuffix: row.maskedTokenSuffix,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeServerUrl(serverUrl: string): Result<string, McpServerConnectionError> {
  const urlResult = validatePublicHttpUrl(serverUrl.trim());
  if (isErr(urlResult)) {
    return err({
      code: "mcp_server_url_invalid",
      message: formatSsrfGuardError(urlResult.error),
    });
  }

  // Canonicalize without trailing slash noise for the unique index.
  const normalized = urlResult.value.toString().replace(/\/+$/, "");
  return ok(normalized);
}

function normalizeSecret(input: {
  authKind: McpServerAuthKind;
  bearerToken?: string;
  headers?: Record<string, string>;
}): Result<McpServerAuthSecret, McpServerConnectionError> {
  if (input.authKind === "none") {
    return ok({});
  }

  if (input.authKind === "bearer") {
    const bearerToken = input.bearerToken?.trim();
    if (!bearerToken) {
      return err({
        code: "mcp_server_auth_required",
        message: "Bearer token is required for bearer authentication.",
      });
    }
    return ok({ bearerToken });
  }

  const headers = Object.fromEntries(
    Object.entries(input.headers ?? {})
      .map(([key, value]) => [key.trim(), value.trim()] as const)
      .filter(([key, value]) => key.length > 0 && value.length > 0),
  );

  if (Object.keys(headers).length === 0) {
    return err({
      code: "mcp_server_auth_required",
      message: "At least one header is required for headers authentication.",
    });
  }

  return ok({ headers });
}

function maskSecret(authKind: McpServerAuthKind, secret: McpServerAuthSecret): string {
  if (authKind === "bearer" && secret.bearerToken) {
    return maskProviderCredentialSuffix(secret.bearerToken);
  }
  if (authKind === "headers" && secret.headers) {
    const firstValue = Object.values(secret.headers)[0];
    return firstValue ? maskProviderCredentialSuffix(firstValue) : "••••hdrs";
  }
  return EMPTY_SECRET_MASK;
}

function encryptSecret(secret: McpServerAuthSecret) {
  return unwrapProviderCredentialCrypto(encryptProviderCredential(JSON.stringify(secret)));
}

function decryptSecret(
  row: McpServerConnectionRow,
): Result<McpServerAuthSecret, McpServerConnectionError> {
  const decrypted = decryptProviderCredential({
    algorithm: row.encryptionAlgorithm,
    keyVersion: row.keyVersion,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
  });
  if (isErr(decrypted)) {
    return err({
      code: "mcp_server_connection_decrypt_failed",
      message: "Unable to decrypt MCP server credentials.",
    });
  }

  try {
    const parsed = JSON.parse(decrypted.value) as McpServerAuthSecret;
    return ok({
      bearerToken: parsed.bearerToken?.trim() || undefined,
      headers: parsed.headers,
    });
  } catch {
    return err({
      code: "mcp_server_connection_decrypt_failed",
      message: "Unable to parse MCP server credentials.",
    });
  }
}

export function buildMcpServerAuthHeaders(input: {
  authKind: McpServerAuthKind;
  secret: McpServerAuthSecret;
}): Record<string, string> {
  const headers: Record<string, string> = { ...input.secret.headers };
  if (input.authKind === "bearer" && input.secret.bearerToken) {
    headers.Authorization = `Bearer ${input.secret.bearerToken}`;
  }
  return headers;
}

export async function listMcpServerConnections(input: {
  organizationId: string;
}): Promise<McpServerConnectionSummary[]> {
  const rows = await db
    .select()
    .from(schema.mcpServerConnections)
    .where(eq(schema.mcpServerConnections.organizationId, input.organizationId))
    .orderBy(desc(schema.mcpServerConnections.createdAt));

  return rows.map(serializeConnection);
}

export async function getMcpServerConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<McpServerConnectionSummary | null> {
  const [row] = await db
    .select()
    .from(schema.mcpServerConnections)
    .where(
      and(
        eq(schema.mcpServerConnections.organizationId, input.organizationId),
        eq(schema.mcpServerConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  return row ? serializeConnection(row) : null;
}

export async function loadMcpServerConnectionWithSecret(input: {
  organizationId: string;
  connectionId: string;
}): Promise<Result<McpServerConnectionWithSecret, McpServerConnectionError>> {
  const [row] = await db
    .select()
    .from(schema.mcpServerConnections)
    .where(
      and(
        eq(schema.mcpServerConnections.organizationId, input.organizationId),
        eq(schema.mcpServerConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!row) {
    return err({
      code: "mcp_server_connection_not_found",
      message: "MCP server connection was not found.",
    });
  }

  const secretResult = decryptSecret(row);
  if (isErr(secretResult)) {
    return secretResult;
  }

  return ok({
    connection: serializeConnection(row),
    secret: secretResult.value,
  });
}

export async function createMcpServerConnection(input: {
  organizationId: string;
  userId: string;
  displayName: string;
  serverUrl: string;
  transport: McpServerTransport;
  authKind: McpServerAuthKind;
  bearerToken?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  db?: DatabaseClient;
}): Promise<Result<McpServerConnectionSummary, McpServerConnectionError>> {
  const serverUrlResult = normalizeServerUrl(input.serverUrl);
  if (isErr(serverUrlResult)) {
    return serverUrlResult;
  }

  const secretResult = normalizeSecret({
    authKind: input.authKind,
    bearerToken: input.bearerToken,
    headers: input.headers,
  });
  if (isErr(secretResult)) {
    return secretResult;
  }

  const encrypted = encryptSecret(secretResult.value);
  const database = input.db ?? db;

  try {
    const [row] = await database
      .insert(schema.mcpServerConnections)
      .values({
        organizationId: input.organizationId,
        createdByUserId: input.userId,
        updatedByUserId: input.userId,
        displayName: input.displayName.trim(),
        serverUrl: serverUrlResult.value,
        transport: input.transport,
        authKind: input.authKind,
        enabled: input.enabled ?? true,
        validationStatus: "unvalidated",
        encryptionAlgorithm: encrypted.algorithm,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
        maskedTokenSuffix: maskSecret(input.authKind, secretResult.value),
      })
      .returning();

    if (!row) {
      throw new Error("mcp_server_connection_create_failed");
    }

    return ok(serializeConnection(row));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      return err({
        code: "mcp_server_connection_duplicate_url",
        message: "An MCP server connection with this URL already exists.",
      });
    }
    throw error;
  }
}

export async function updateMcpServerConnection(input: {
  organizationId: string;
  userId: string;
  connectionId: string;
  displayName?: string;
  serverUrl?: string;
  transport?: McpServerTransport;
  authKind?: McpServerAuthKind;
  bearerToken?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  db?: DatabaseClient;
}): Promise<Result<McpServerConnectionSummary | null, McpServerConnectionError>> {
  const database = input.db ?? db;
  const [existing] = await database
    .select()
    .from(schema.mcpServerConnections)
    .where(
      and(
        eq(schema.mcpServerConnections.organizationId, input.organizationId),
        eq(schema.mcpServerConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!existing) {
    return ok(null);
  }

  const nextAuthKind = (input.authKind ?? existing.authKind) as McpServerAuthKind;
  const nextTransport = (input.transport ?? existing.transport) as McpServerTransport;

  let nextServerUrl = existing.serverUrl;
  if (input.serverUrl !== undefined) {
    const serverUrlResult = normalizeServerUrl(input.serverUrl);
    if (isErr(serverUrlResult)) {
      return serverUrlResult;
    }
    nextServerUrl = serverUrlResult.value;
  }

  const shouldUpdateSecret =
    input.bearerToken !== undefined ||
    input.headers !== undefined ||
    (input.authKind !== undefined && input.authKind !== existing.authKind);

  let encrypted: ReturnType<typeof encryptSecret> | null = null;
  let maskedTokenSuffix = existing.maskedTokenSuffix;

  if (shouldUpdateSecret) {
    let existingSecret: McpServerAuthSecret = {};
    if (input.bearerToken === undefined && input.headers === undefined) {
      const decrypted = decryptSecret(existing);
      if (isErr(decrypted)) {
        return decrypted;
      }
      existingSecret = decrypted.value;
    }

    const secretResult = normalizeSecret({
      authKind: nextAuthKind,
      bearerToken: input.bearerToken ?? existingSecret.bearerToken,
      headers: input.headers ?? existingSecret.headers,
    });
    if (isErr(secretResult)) {
      return secretResult;
    }

    encrypted = encryptSecret(secretResult.value);
    maskedTokenSuffix = maskSecret(nextAuthKind, secretResult.value);
  }

  try {
    const [row] = await database
      .update(schema.mcpServerConnections)
      .set({
        updatedByUserId: input.userId,
        displayName: input.displayName?.trim() ?? existing.displayName,
        serverUrl: nextServerUrl,
        transport: nextTransport,
        authKind: nextAuthKind,
        enabled: input.enabled ?? existing.enabled,
        ...(encrypted
          ? {
              encryptionAlgorithm: encrypted.algorithm,
              ciphertext: encrypted.ciphertext,
              iv: encrypted.iv,
              authTag: encrypted.authTag,
              keyVersion: encrypted.keyVersion,
              maskedTokenSuffix,
              validationStatus: "unvalidated",
              validationMessage: null,
              lastValidatedAt: null,
            }
          : {}),
        ...(input.serverUrl !== undefined && !encrypted
          ? {
              validationStatus: "unvalidated",
              validationMessage: null,
              lastValidatedAt: null,
            }
          : {}),
      })
      .where(
        and(
          eq(schema.mcpServerConnections.organizationId, input.organizationId),
          eq(schema.mcpServerConnections.id, input.connectionId),
        ),
      )
      .returning();

    return ok(row ? serializeConnection(row) : null);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      return err({
        code: "mcp_server_connection_duplicate_url",
        message: "An MCP server connection with this URL already exists.",
      });
    }
    throw error;
  }
}

export async function deleteMcpServerConnection(input: {
  organizationId: string;
  connectionId: string;
  db?: DatabaseClient;
}): Promise<boolean> {
  const database = input.db ?? db;
  const deleted = await database
    .delete(schema.mcpServerConnections)
    .where(
      and(
        eq(schema.mcpServerConnections.organizationId, input.organizationId),
        eq(schema.mcpServerConnections.id, input.connectionId),
      ),
    )
    .returning({ id: schema.mcpServerConnections.id });

  return deleted.length > 0;
}
