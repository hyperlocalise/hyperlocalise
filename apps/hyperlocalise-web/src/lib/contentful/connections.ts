import { randomBytes } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { ContentfulManagementClient, isContentfulClientError } from "./client";
import { loadContentfulConnectionWithToken } from "./contentful-connection-access";
import { hashContentfulWebhookSecret } from "./webhook";
import {
  contentfulWebhookCallbackUrl,
  deleteContentfulProviderWebhook,
  syncContentfulProviderWebhook,
} from "./webhook-provider";
import type {
  ContentfulConnectionFieldConfig,
  ContentfulConnectionSecretResult,
  ContentfulConnectionSummary,
  ContentfulConnectionValidation,
  ContentfulConnectionValidationError,
} from "./types";

type ContentfulConnectionRow = typeof schema.contentfulConnections.$inferSelect;
type ContentfulWebhookSubscriptionRow = typeof schema.contentfulWebhookSubscriptions.$inferSelect;

function normalizeFieldConfig(value: Record<string, unknown>): ContentfulConnectionFieldConfig {
  return value as ContentfulConnectionFieldConfig;
}

function webhookUrl(subscriptionId: string) {
  return contentfulWebhookCallbackUrl(subscriptionId);
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

async function syncConnectionProviderWebhook(input: {
  connection: ContentfulConnectionRow;
  subscription: ContentfulWebhookSubscriptionRow;
  accessToken: string;
  webhookSecret?: string | null;
}): Promise<ContentfulConnectionSecretResult> {
  const synced = await syncContentfulProviderWebhook({
    connection: input.connection,
    subscription: input.subscription,
    accessToken: input.accessToken,
    webhookSecret: input.webhookSecret,
  });

  return {
    connection: serializeConnection(input.connection, synced.subscription),
    webhookSecret: synced.webhookSecret,
  };
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

export { loadContentfulConnectionWithToken } from "./contentful-connection-access";

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

  return syncConnectionProviderWebhook({
    connection,
    subscription: webhook.row,
    accessToken: input.accessToken,
    webhookSecret: webhook.webhookSecret,
  });
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
  const shouldResetValidation = !!(input.accessToken || input.spaceId || input.environmentId);

  const [previousConnection] = await db
    .select()
    .from(schema.contentfulConnections)
    .where(
      and(
        eq(schema.contentfulConnections.organizationId, input.organizationId),
        eq(schema.contentfulConnections.id, input.connectionId),
      ),
    )
    .limit(1);

  if (!previousConnection) {
    return null;
  }

  const [previousSubscription] = await db
    .select()
    .from(schema.contentfulWebhookSubscriptions)
    .where(eq(schema.contentfulWebhookSubscriptions.connectionId, input.connectionId))
    .limit(1);

  const previousToken = encrypted
    ? input.accessToken!
    : unwrapProviderCredentialCrypto(
        decryptProviderCredential({
          algorithm: previousConnection.encryptionAlgorithm,
          keyVersion: previousConnection.keyVersion,
          ciphertext: previousConnection.ciphertext,
          iv: previousConnection.iv,
          authTag: previousConnection.authTag,
        }),
      );

  const spaceChanged = input.spaceId !== undefined && input.spaceId !== previousConnection.spaceId;
  if (spaceChanged && previousSubscription?.providerWebhookId && previousConnection.spaceId) {
    await deleteContentfulProviderWebhook({
      accessToken: previousToken,
      spaceId: previousConnection.spaceId,
      environmentId: previousConnection.environmentId,
      providerWebhookId: previousSubscription.providerWebhookId,
    });
    await db
      .update(schema.contentfulWebhookSubscriptions)
      .set({
        providerWebhookId: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.contentfulWebhookSubscriptions.id, previousSubscription.id));
    previousSubscription.providerWebhookId = null;
  }

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
          }
        : {}),
      ...(shouldResetValidation
        ? {
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

  const accessToken = encrypted ? input.accessToken! : previousToken;

  return syncConnectionProviderWebhook({
    connection,
    subscription: webhook.row,
    accessToken,
    webhookSecret: webhook.webhookSecret,
  });
}

export async function deleteContentfulConnection(input: {
  organizationId: string;
  connectionId: string;
}) {
  const loaded = await loadContentfulConnectionWithToken(input);
  const [subscription] = loaded
    ? await db
        .select()
        .from(schema.contentfulWebhookSubscriptions)
        .where(eq(schema.contentfulWebhookSubscriptions.connectionId, input.connectionId))
        .limit(1)
    : [];

  if (loaded && subscription?.providerWebhookId) {
    await deleteContentfulProviderWebhook({
      accessToken: loaded.token,
      spaceId: loaded.connection.spaceId,
      environmentId: loaded.connection.environmentId,
      providerWebhookId: subscription.providerWebhookId,
    });
  }

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

export { discoverContentfulSpace } from "./discover-contentful-space";

export async function validateContentfulConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<Result<ContentfulConnectionValidation, ContentfulConnectionValidationError> | null> {
  const loaded = await loadContentfulConnectionWithToken(input);
  if (!loaded) {
    return null;
  }

  const client = new ContentfulManagementClient({
    accessToken: loaded.token,
    spaceId: loaded.connection.spaceId,
    environmentId: loaded.connection.environmentId,
  });

  const validationResult = await client.validateConnection();
  if (isErr(validationResult)) {
    await db
      .update(schema.contentfulConnections)
      .set({
        validationStatus: "error",
        validationMessage: validationResult.error.message,
        lastValidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.contentfulConnections.id, loaded.connection.id));
    return err({
      code: "contentful_connection_validation_failed",
      message: validationResult.error.message,
    });
  }

  try {
    await db
      .update(schema.contentfulConnections)
      .set({
        validationStatus: "connected",
        validationMessage: null,
        lastValidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.contentfulConnections.id, loaded.connection.id));

    const [subscription] = await db
      .select()
      .from(schema.contentfulWebhookSubscriptions)
      .where(eq(schema.contentfulWebhookSubscriptions.connectionId, loaded.connection.id))
      .limit(1);

    if (subscription) {
      await syncContentfulProviderWebhook({
        connection: loaded.connection,
        subscription,
        accessToken: loaded.token,
      });
    }

    return ok(validationResult.value);
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
    return err({
      code: "contentful_connection_validation_failed",
      message,
    });
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
