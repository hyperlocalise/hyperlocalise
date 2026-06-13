import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { env } from "@/lib/env";
import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import {
  ContentfulManagementClient,
  CONTENTFUL_WEBHOOK_PUBLISH_TOPIC,
  CONTENTFUL_WEBHOOK_SECRET_HEADER,
  isContentfulClientError,
  type ContentfulClientError,
  type ContentfulWebhookDefinition,
} from "./client";
import { hashContentfulWebhookSecret } from "./webhook";

const logger = createLogger("contentful-webhook-provider");

type ContentfulConnectionRow = typeof schema.contentfulConnections.$inferSelect;
type ContentfulWebhookSubscriptionRow = typeof schema.contentfulWebhookSubscriptions.$inferSelect;

export function contentfulWebhookCallbackUrl(subscriptionId: string) {
  if (!env.HYPERLOCALISE_PUBLIC_APP_URL) {
    return null;
  }
  return `${env.HYPERLOCALISE_PUBLIC_APP_URL}/api/webhooks/contentful/${subscriptionId}`;
}

export function buildContentfulProviderWebhookName(displayName: string) {
  const trimmed = displayName.trim() || "Contentful connection";
  return `Hyperlocalise: ${trimmed}`.slice(0, 255);
}

export function buildContentfulProviderWebhookFilters(contentTypeIds: string[]) {
  if (contentTypeIds.length === 0) {
    return [];
  }

  if (contentTypeIds.length === 1) {
    return [
      {
        equals: [{ doc: "sys.contentType.sys.id" }, contentTypeIds[0]],
      },
    ];
  }

  return [
    {
      in: [{ doc: "sys.contentType.sys.id" }, contentTypeIds],
    },
  ];
}

function buildWebhookHeaders(webhookSecret: string | null) {
  if (webhookSecret) {
    return [
      {
        key: CONTENTFUL_WEBHOOK_SECRET_HEADER,
        value: webhookSecret,
        secret: true,
      },
    ];
  }

  return [
    {
      key: CONTENTFUL_WEBHOOK_SECRET_HEADER,
      secret: true,
    },
  ];
}

async function persistWebhookSubscriptionState(input: {
  subscriptionId: string;
  providerWebhookId?: string | null;
  lastError?: string | null;
  secretHash?: string;
}) {
  const [row] = await db
    .update(schema.contentfulWebhookSubscriptions)
    .set({
      ...(input.providerWebhookId !== undefined
        ? { providerWebhookId: input.providerWebhookId }
        : {}),
      ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
      ...(input.secretHash !== undefined ? { secretHash: input.secretHash } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.contentfulWebhookSubscriptions.id, input.subscriptionId))
    .returning();

  if (!row) {
    throw new Error("contentful_webhook_subscription_update_failed");
  }

  return row;
}

function generateWebhookSecret() {
  return randomBytes(32).toString("base64url");
}

function resolvePendingWebhookSecret(input: {
  webhookSecret?: string | null;
  providerWebhookId: string | null;
}) {
  if (input.webhookSecret) {
    return input.webhookSecret;
  }
  if (!input.providerWebhookId) {
    return generateWebhookSecret();
  }
  return null;
}

function formatContentfulWebhookSyncError(error: unknown) {
  if (isContentfulClientError(error)) {
    if (error.status === 403) {
      return "Contentful token lacks permission to manage webhooks in this space.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Contentful webhook registration failed.";
}

async function findProviderWebhookByUrl(
  client: ContentfulManagementClient,
  url: string,
): Promise<Result<ContentfulWebhookDefinition | null, ContentfulClientError>> {
  const webhooksResult = await client.listWebhooks();
  if (isErr(webhooksResult)) {
    return err(webhooksResult.error);
  }
  return ok(webhooksResult.value.find((webhook) => webhook.url === url) ?? null);
}

export async function deleteContentfulProviderWebhook(input: {
  accessToken: string;
  spaceId: string;
  environmentId: string;
  providerWebhookId: string;
}) {
  const client = new ContentfulManagementClient({
    accessToken: input.accessToken,
    spaceId: input.spaceId,
    environmentId: input.environmentId,
  });

  const deleteResult = await client.deleteWebhook(input.providerWebhookId);
  if (isErr(deleteResult)) {
    logger.warn(
      {
        providerWebhookId: input.providerWebhookId,
        spaceId: input.spaceId,
        error: deleteResult.error.message,
      },
      "contentful provider webhook delete failed",
    );
  }
}

export async function syncContentfulProviderWebhook(input: {
  connection: ContentfulConnectionRow;
  subscription: ContentfulWebhookSubscriptionRow;
  accessToken: string;
  webhookSecret?: string | null;
}): Promise<{
  subscription: ContentfulWebhookSubscriptionRow;
  webhookSecret: string | null;
}> {
  const callbackUrl = contentfulWebhookCallbackUrl(input.subscription.id);
  if (!callbackUrl) {
    const subscription = await persistWebhookSubscriptionState({
      subscriptionId: input.subscription.id,
      lastError: "Set HYPERLOCALISE_PUBLIC_APP_URL to register the Contentful webhook.",
    });
    return { subscription, webhookSecret: null };
  }

  const client = new ContentfulManagementClient({
    accessToken: input.accessToken,
    spaceId: input.connection.spaceId,
    environmentId: input.connection.environmentId,
  });

  const name = buildContentfulProviderWebhookName(input.connection.displayName);
  const filters = buildContentfulProviderWebhookFilters(input.connection.contentTypeIds);
  const pendingSecret = resolvePendingWebhookSecret({
    webhookSecret: input.webhookSecret,
    providerWebhookId: input.subscription.providerWebhookId,
  });
  const shouldPersistPendingSecret = pendingSecret !== null && !input.webhookSecret;

  try {
    const headers = buildWebhookHeaders(pendingSecret);
    const payload = {
      name,
      url: callbackUrl,
      topics: [CONTENTFUL_WEBHOOK_PUBLISH_TOPIC],
      filters,
      headers,
    };

    let providerWebhook: ContentfulWebhookDefinition | null = null;

    if (input.subscription.providerWebhookId) {
      const providerWebhookResult = await client.getWebhook(input.subscription.providerWebhookId);
      if (isErr(providerWebhookResult)) {
        if (providerWebhookResult.error.status !== 404) {
          throw providerWebhookResult.error;
        }
      } else {
        providerWebhook = providerWebhookResult.value;
      }
    }

    if (!providerWebhook) {
      const providerWebhookResult = await findProviderWebhookByUrl(client, callbackUrl);
      if (isErr(providerWebhookResult)) {
        throw providerWebhookResult.error;
      }
      providerWebhook = providerWebhookResult.value;
    }

    if (providerWebhook) {
      const updatedResult = await client.updateWebhook(providerWebhook.sys.id, {
        version: providerWebhook.sys.version ?? 1,
        ...payload,
      });
      if (isErr(updatedResult)) {
        throw updatedResult.error;
      }
      const subscription = await persistWebhookSubscriptionState({
        subscriptionId: input.subscription.id,
        providerWebhookId: updatedResult.value.sys.id,
        lastError: null,
        ...(shouldPersistPendingSecret && pendingSecret
          ? { secretHash: hashContentfulWebhookSecret(pendingSecret) }
          : {}),
      });
      return { subscription, webhookSecret: pendingSecret };
    }

    const createSecret = pendingSecret ?? generateWebhookSecret();
    const createdResult = await client.createWebhook({
      ...payload,
      headers: buildWebhookHeaders(createSecret),
    });
    if (isErr(createdResult)) {
      throw createdResult.error;
    }
    const subscription = await persistWebhookSubscriptionState({
      subscriptionId: input.subscription.id,
      providerWebhookId: createdResult.value.sys.id,
      lastError: null,
      secretHash: hashContentfulWebhookSecret(createSecret),
    });
    return {
      subscription,
      webhookSecret: input.webhookSecret ?? createSecret,
    };
  } catch (error) {
    const message = formatContentfulWebhookSyncError(error);
    logger.error(
      {
        connectionId: input.connection.id,
        subscriptionId: input.subscription.id,
        spaceId: input.connection.spaceId,
        error: message,
      },
      "contentful provider webhook sync failed",
    );
    const subscription = await persistWebhookSubscriptionState({
      subscriptionId: input.subscription.id,
      lastError: message,
    });
    return { subscription, webhookSecret: pendingSecret };
  }
}

export async function syncContentfulProviderWebhookForConnection(input: {
  organizationId: string;
  connectionId: string;
  accessToken: string;
  webhookSecret?: string | null;
}) {
  const [connection] = await db
    .select()
    .from(schema.contentfulConnections)
    .where(eq(schema.contentfulConnections.id, input.connectionId))
    .limit(1);

  if (!connection || connection.organizationId !== input.organizationId) {
    return null;
  }

  const [subscription] = await db
    .select()
    .from(schema.contentfulWebhookSubscriptions)
    .where(eq(schema.contentfulWebhookSubscriptions.connectionId, connection.id))
    .limit(1);

  if (!subscription) {
    return null;
  }

  return syncContentfulProviderWebhook({
    connection,
    subscription,
    accessToken: input.accessToken,
    webhookSecret: input.webhookSecret,
  });
}
