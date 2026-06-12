import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { env } from "@/lib/env";
import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";

import {
  ContentfulManagementClient,
  CONTENTFUL_WEBHOOK_PUBLISH_TOPIC,
  CONTENTFUL_WEBHOOK_SECRET_HEADER,
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

async function rotateWebhookSubscriptionSecret(subscriptionId: string) {
  const webhookSecret = generateWebhookSecret();
  await persistWebhookSubscriptionState({
    subscriptionId,
    secretHash: hashContentfulWebhookSecret(webhookSecret),
    lastError: null,
  });
  return webhookSecret;
}

async function findProviderWebhookByUrl(
  client: ContentfulManagementClient,
  url: string,
): Promise<ContentfulWebhookDefinition | null> {
  const webhooks = await client.listWebhooks();
  return webhooks.find((webhook) => webhook.url === url) ?? null;
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

  try {
    await client.deleteWebhook(input.providerWebhookId);
  } catch (error) {
    logger.warn(
      {
        providerWebhookId: input.providerWebhookId,
        spaceId: input.spaceId,
        error: error instanceof Error ? error.message : String(error),
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
  let webhookSecret = input.webhookSecret ?? null;

  try {
    if (!webhookSecret && !input.subscription.providerWebhookId) {
      webhookSecret = await rotateWebhookSubscriptionSecret(input.subscription.id);
    }

    const headers = buildWebhookHeaders(webhookSecret);
    const payload = {
      name,
      url: callbackUrl,
      topics: [CONTENTFUL_WEBHOOK_PUBLISH_TOPIC],
      filters,
      headers,
    };

    let providerWebhook: ContentfulWebhookDefinition | null = null;

    if (input.subscription.providerWebhookId) {
      try {
        providerWebhook = await client.getWebhook(input.subscription.providerWebhookId);
      } catch {
        providerWebhook = null;
      }
    }

    if (!providerWebhook) {
      providerWebhook = await findProviderWebhookByUrl(client, callbackUrl);
    }

    if (providerWebhook) {
      const updated = await client.updateWebhook(providerWebhook.sys.id, {
        version: providerWebhook.sys.version ?? 1,
        ...payload,
      });
      const subscription = await persistWebhookSubscriptionState({
        subscriptionId: input.subscription.id,
        providerWebhookId: updated.sys.id,
        lastError: null,
      });
      return { subscription, webhookSecret };
    }

    if (!webhookSecret) {
      webhookSecret = await rotateWebhookSubscriptionSecret(input.subscription.id);
    }

    const created = await client.createWebhook({
      ...payload,
      headers: buildWebhookHeaders(webhookSecret),
    });
    const subscription = await persistWebhookSubscriptionState({
      subscriptionId: input.subscription.id,
      providerWebhookId: created.sys.id,
      lastError: null,
    });
    return { subscription, webhookSecret };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Contentful webhook registration failed.";
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
    return { subscription, webhookSecret };
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
