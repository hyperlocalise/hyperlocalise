import { randomBytes } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { env } from "@/lib/env";
import { db, schema } from "@/lib/database";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

import { ContentfulManagementClient, isContentfulClientError } from "./client";
import { hashContentfulWebhookSecret } from "./webhook";
import type {
  ContentfulConnectionFieldConfig,
  ContentfulConnectionSecretResult,
  ContentfulConnectionSummary,
} from "./types";

type ContentfulConnectionRow = typeof schema.contentfulConnections.$inferSelect;
type ContentfulWebhookSubscriptionRow = typeof schema.contentfulWebhookSubscriptions.$inferSelect;

function normalizeFieldConfig(value: Record<string, unknown>): ContentfulConnectionFieldConfig {
  return value as ContentfulConnectionFieldConfig;
}

function webhookUrl(subscriptionId: string) {
  if (!env.HYPERLOCALISE_PUBLIC_APP_URL) {
    return null;
  }
  return `${env.HYPERLOCALISE_PUBLIC_APP_URL}/api/webhooks/contentful/${subscriptionId}`;
}

function serializeConnection(
  connection: ContentfulConnectionRow,
  webhook: ContentfulWebhookSubscriptionRow | null,
): ContentfulConnectionSummary {
  return {
    id: connection.id,
    organizationId: connection.organizationId,
    projectId: connection.projectId,
    displayName: connection.displayName,
    spaceId: connection.spaceId,
    environmentId: connection.environmentId,
    sourceLocale: connection.sourceLocale,
    targetLocales: connection.targetLocales,
    contentTypeIds: connection.contentTypeIds,
    fieldConfig: normalizeFieldConfig(connection.fieldConfig),
    enabled: connection.enabled,
    validationStatus: connection.validationStatus,
    validationMessage: connection.validationMessage,
    lastValidatedAt: connection.lastValidatedAt?.toISOString() ?? null,
    maskedTokenSuffix: connection.maskedTokenSuffix,
    webhook: webhook
      ? {
          id: webhook.id,
          status: webhook.status,
          providerWebhookId: webhook.providerWebhookId,
          lastDeliveryId: webhook.lastDeliveryId,
          lastDeliveredAt: webhook.lastDeliveredAt?.toISOString() ?? null,
          lastError: webhook.lastError,
          url: webhookUrl(webhook.id),
        }
      : null,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

function generateWebhookSecret() {
  return randomBytes(32).toString("base64url");
}

export async function ensureContentfulWebhookSubscription(input: {
  organizationId: string;
  connectionId: string;
}): Promise<{ row: ContentfulWebhookSubscriptionRow; webhookSecret: string | null }> {
  const [existing] = await db
    .select()
    .from(schema.contentfulWebhookSubscriptions)
    .where(
      and(
        eq(schema.contentfulWebhookSubscriptions.organizationId, input.organizationId),
        eq(schema.contentfulWebhookSubscriptions.connectionId, input.connectionId),
      ),
    )
    .limit(1);

  if (existing) {
    return { row: existing, webhookSecret: null };
  }

  const webhookSecret = generateWebhookSecret();
  const [row] = await db
    .insert(schema.contentfulWebhookSubscriptions)
    .values({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      secretHash: hashContentfulWebhookSecret(webhookSecret),
      status: "active",
    })
    .returning();

  if (!row) {
    throw new Error("contentful_webhook_subscription_create_failed");
  }

  return { row, webhookSecret };
}

export async function listContentfulConnections(input: {
  organizationId: string;
}): Promise<ContentfulConnectionSummary[]> {
  const rows = await db
    .select({
      connection: schema.contentfulConnections,
      webhook: schema.contentfulWebhookSubscriptions,
    })
    .from(schema.contentfulConnections)
    .leftJoin(
      schema.contentfulWebhookSubscriptions,
      eq(schema.contentfulWebhookSubscriptions.connectionId, schema.contentfulConnections.id),
    )
    .where(eq(schema.contentfulConnections.organizationId, input.organizationId))
    .orderBy(desc(schema.contentfulConnections.createdAt));

  return rows.map(({ connection, webhook }) => serializeConnection(connection, webhook));
}

export async function getContentfulConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<ContentfulConnectionSummary | null> {
  const [row] = await db
    .select({
      connection: schema.contentfulConnections,
      webhook: schema.contentfulWebhookSubscriptions,
    })
    .from(schema.contentfulConnections)
    .leftJoin(
      schema.contentfulWebhookSubscriptions,
      eq(schema.contentfulWebhookSubscriptions.connectionId, schema.contentfulConnections.id),
    )
    .where(
      and(
        eq(schema.contentfulConnections.organizationId, input.organizationId),
        eq(schema.contentfulConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  return row ? serializeConnection(row.connection, row.webhook) : null;
}

export async function loadContentfulConnectionWithToken(input: {
  organizationId: string;
  connectionId: string;
}) {
  const [connection] = await db
    .select()
    .from(schema.contentfulConnections)
    .where(
      and(
        eq(schema.contentfulConnections.organizationId, input.organizationId),
        eq(schema.contentfulConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!connection) {
    return null;
  }

  const token = unwrapProviderCredentialCrypto(
    decryptProviderCredential({
      algorithm: connection.encryptionAlgorithm,
      keyVersion: connection.keyVersion,
      ciphertext: connection.ciphertext,
      iv: connection.iv,
      authTag: connection.authTag,
    }),
  );

  return { connection, token };
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
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.id, input.projectId),
      ),
    )
    .limit(1);

  if (!project) {
    throw new Error("project_not_found");
  }
}

export async function createContentfulConnection(input: {
  organizationId: string;
  userId: string;
  projectId: string;
  displayName: string;
  spaceId: string;
  environmentId: string;
  sourceLocale: string;
  targetLocales: string[];
  contentTypeIds: string[];
  fieldConfig: ContentfulConnectionFieldConfig;
  accessToken: string;
  enabled?: boolean;
}): Promise<ContentfulConnectionSecretResult> {
  await assertProjectBelongsToOrganization({
    organizationId: input.organizationId,
    projectId: input.projectId,
  });

  const encrypted = unwrapProviderCredentialCrypto(encryptProviderCredential(input.accessToken));
  const [connection] = await db
    .insert(schema.contentfulConnections)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      displayName: input.displayName,
      spaceId: input.spaceId,
      environmentId: input.environmentId,
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales,
      contentTypeIds: input.contentTypeIds,
      fieldConfig: input.fieldConfig,
      enabled: input.enabled ?? true,
      validationStatus: "unvalidated",
      encryptionAlgorithm: encrypted.algorithm,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      maskedTokenSuffix: maskProviderCredentialSuffix(input.accessToken),
    })
    .returning();

  if (!connection) {
    throw new Error("contentful_connection_create_failed");
  }

  const webhook = await ensureContentfulWebhookSubscription({
    organizationId: input.organizationId,
    connectionId: connection.id,
  });

  return {
    connection: serializeConnection(connection, webhook.row),
    webhookSecret: webhook.webhookSecret,
  };
}

export async function updateContentfulConnection(input: {
  organizationId: string;
  userId: string;
  connectionId: string;
  projectId?: string;
  displayName?: string;
  spaceId?: string;
  environmentId?: string;
  sourceLocale?: string;
  targetLocales?: string[];
  contentTypeIds?: string[];
  fieldConfig?: ContentfulConnectionFieldConfig;
  accessToken?: string;
  enabled?: boolean;
}): Promise<ContentfulConnectionSecretResult | null> {
  if (input.projectId) {
    await assertProjectBelongsToOrganization({
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
  }

  const encrypted = input.accessToken
    ? unwrapProviderCredentialCrypto(encryptProviderCredential(input.accessToken))
    : null;

  const [connection] = await db
    .update(schema.contentfulConnections)
    .set({
      updatedByUserId: input.userId,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.spaceId !== undefined ? { spaceId: input.spaceId } : {}),
      ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
      ...(input.sourceLocale !== undefined ? { sourceLocale: input.sourceLocale } : {}),
      ...(input.targetLocales !== undefined ? { targetLocales: input.targetLocales } : {}),
      ...(input.contentTypeIds !== undefined ? { contentTypeIds: input.contentTypeIds } : {}),
      ...(input.fieldConfig !== undefined ? { fieldConfig: input.fieldConfig } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(encrypted
        ? {
            encryptionAlgorithm: encrypted.algorithm,
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            keyVersion: encrypted.keyVersion,
            maskedTokenSuffix: maskProviderCredentialSuffix(input.accessToken ?? ""),
            validationStatus: "unvalidated",
            validationMessage: null,
            lastValidatedAt: null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.contentfulConnections.organizationId, input.organizationId),
        eq(schema.contentfulConnections.id, input.connectionId),
      ),
    )
    .returning();

  if (!connection) {
    return null;
  }

  const webhook = await ensureContentfulWebhookSubscription({
    organizationId: input.organizationId,
    connectionId: connection.id,
  });

  return {
    connection: serializeConnection(connection, webhook.row),
    webhookSecret: webhook.webhookSecret,
  };
}

export async function deleteContentfulConnection(input: {
  organizationId: string;
  connectionId: string;
}) {
  const [deleted] = await db
    .delete(schema.contentfulConnections)
    .where(
      and(
        eq(schema.contentfulConnections.organizationId, input.organizationId),
        eq(schema.contentfulConnections.id, input.connectionId),
      ),
    )
    .returning({ id: schema.contentfulConnections.id });

  return Boolean(deleted);
}

export async function validateContentfulConnection(input: {
  organizationId: string;
  connectionId: string;
}) {
  const loaded = await loadContentfulConnectionWithToken(input);
  if (!loaded) {
    return null;
  }

  const client = new ContentfulManagementClient({
    accessToken: loaded.token,
    spaceId: loaded.connection.spaceId,
    environmentId: loaded.connection.environmentId,
  });

  try {
    const validation = await client.validateConnection();
    await db
      .update(schema.contentfulConnections)
      .set({
        validationStatus: "connected",
        validationMessage: null,
        lastValidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.contentfulConnections.id, loaded.connection.id));
    return { ok: true as const, validation };
  } catch (error) {
    const message = isContentfulClientError(error)
      ? error.message
      : "Unable to validate Contentful connection.";
    await db
      .update(schema.contentfulConnections)
      .set({
        validationStatus: "error",
        validationMessage: message,
        lastValidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.contentfulConnections.id, loaded.connection.id));
    return { ok: false as const, message };
  }
}

export async function getContentfulWebhookSubscription(input: { subscriptionId: string }) {
  const [row] = await db
    .select({
      subscription: schema.contentfulWebhookSubscriptions,
      connection: schema.contentfulConnections,
    })
    .from(schema.contentfulWebhookSubscriptions)
    .innerJoin(
      schema.contentfulConnections,
      eq(schema.contentfulConnections.id, schema.contentfulWebhookSubscriptions.connectionId),
    )
    .where(eq(schema.contentfulWebhookSubscriptions.id, input.subscriptionId))
    .limit(1);

  return row ?? null;
}
