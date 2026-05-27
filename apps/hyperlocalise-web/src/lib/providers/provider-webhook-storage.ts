import { and, eq, or, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type {
  ProviderWebhookEventProcessingStatus,
  ProviderWebhookSubscriptionStatus,
} from "@/lib/database/types";
import { encryptProviderCredential } from "@/lib/security/provider-credential-crypto";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

type ProviderWebhookSecretMetadata = {
  maskedSecretSuffix?: string;
  encryptionAlgorithm?: string;
  keyVersion?: number;
};

export async function insertProviderWebhookSubscription(input: {
  organizationId: string;
  providerCredentialId: string;
  providerKind: ExternalTmsProviderKind;
  providerWebhookId: string;
  endpointUrl: string;
  projectId?: string | null;
  subscribedEvents?: string[];
  status?: ProviderWebhookSubscriptionStatus;
  secretMetadata?: ProviderWebhookSecretMetadata;
  webhookSecretPlaintext?: string | null;
}) {
  const encrypted =
    input.webhookSecretPlaintext != null && input.webhookSecretPlaintext.length > 0
      ? encryptProviderCredential(input.webhookSecretPlaintext)
      : null;

  const [subscription] = await db
    .insert(schema.providerWebhookSubscriptions)
    .values({
      organizationId: input.organizationId,
      providerCredentialId: input.providerCredentialId,
      projectId: input.projectId ?? null,
      providerKind: input.providerKind,
      providerWebhookId: input.providerWebhookId,
      endpointUrl: input.endpointUrl,
      subscribedEvents: input.subscribedEvents ?? [],
      status: input.status ?? "active",
      secretMetadata: input.secretMetadata ?? {},
      webhookSecretCiphertext: encrypted?.ciphertext ?? null,
      webhookSecretIv: encrypted?.iv ?? null,
      webhookSecretAuthTag: encrypted?.authTag ?? null,
      webhookSecretKeyVersion: encrypted?.keyVersion ?? null,
    })
    .returning();

  if (!subscription) {
    throw new Error("Failed to insert provider webhook subscription");
  }

  return subscription;
}

export async function updateProviderWebhookSubscriptionStatus(input: {
  subscriptionId: string;
  organizationId: string;
  status: ProviderWebhookSubscriptionStatus;
  lastError?: string | null;
}) {
  const now = new Date();
  const [subscription] = await db
    .update(schema.providerWebhookSubscriptions)
    .set({
      status: input.status,
      lastError: input.lastError ?? null,
      lastErrorAt: input.lastError ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.providerWebhookSubscriptions.id, input.subscriptionId),
        eq(schema.providerWebhookSubscriptions.organizationId, input.organizationId),
      ),
    )
    .returning();

  if (!subscription) {
    throw new Error("Provider webhook subscription not found");
  }

  return subscription;
}

export async function insertProviderWebhookEvent(input: {
  organizationId: string;
  subscriptionId: string;
  providerKind: ExternalTmsProviderKind;
  providerEventId: string;
  eventType: string;
  dedupeKey: string;
  projectId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  externalResourceId?: string | null;
  redactedPayload?: Record<string, unknown>;
  processingStatus?: ProviderWebhookEventProcessingStatus;
  providerSyncIntentId?: string | null;
  providerSyncRunId?: string | null;
}) {
  const [event] = await db
    .insert(schema.providerWebhookEvents)
    .values({
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      providerKind: input.providerKind,
      projectId: input.projectId ?? null,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      dedupeKey: input.dedupeKey,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      externalResourceId: input.externalResourceId ?? null,
      redactedPayload: input.redactedPayload ?? {},
      processingStatus: input.processingStatus ?? "pending",
      providerSyncIntentId: input.providerSyncIntentId ?? null,
      providerSyncRunId: input.providerSyncRunId ?? null,
    })
    .returning();

  return event ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if ("code" in error && error.code === "23505") {
    return true;
  }

  const cause = "cause" in error ? error.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

async function findExistingProviderWebhookEvent(input: {
  subscriptionId: string;
  providerEventId: string;
  dedupeKey: string;
}) {
  const [existing] = await db
    .select()
    .from(schema.providerWebhookEvents)
    .where(
      and(
        eq(schema.providerWebhookEvents.subscriptionId, input.subscriptionId),
        or(
          eq(schema.providerWebhookEvents.providerEventId, input.providerEventId),
          eq(schema.providerWebhookEvents.dedupeKey, input.dedupeKey),
        ),
      ),
    )
    .limit(1);

  return existing;
}

export async function insertProviderWebhookEventIdempotent(input: {
  organizationId: string;
  subscriptionId: string;
  providerKind: ExternalTmsProviderKind;
  providerEventId: string;
  eventType: string;
  dedupeKey: string;
  projectId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  externalResourceId?: string | null;
  redactedPayload?: Record<string, unknown>;
}) {
  const values = {
    organizationId: input.organizationId,
    subscriptionId: input.subscriptionId,
    providerKind: input.providerKind,
    projectId: input.projectId ?? null,
    providerEventId: input.providerEventId,
    eventType: input.eventType,
    dedupeKey: input.dedupeKey,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    externalResourceId: input.externalResourceId ?? null,
    redactedPayload: input.redactedPayload ?? {},
    processingStatus: "pending" as const,
  };

  const lookupKeys = {
    subscriptionId: input.subscriptionId,
    providerEventId: input.providerEventId,
    dedupeKey: input.dedupeKey,
  };

  try {
    const [event] = await db
      .insert(schema.providerWebhookEvents)
      .values(values)
      .onConflictDoNothing({
        target: [
          schema.providerWebhookEvents.subscriptionId,
          schema.providerWebhookEvents.dedupeKey,
        ],
      })
      .returning();

    if (event) {
      return { event, inserted: true };
    }

    const existing = await findExistingProviderWebhookEvent(lookupKeys);
    return { event: existing, inserted: false };
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const existing = await findExistingProviderWebhookEvent(lookupKeys);
    if (!existing) {
      throw error;
    }

    return { event: existing, inserted: false };
  }
}

export async function updateProviderWebhookEventProcessingStatus(input: {
  eventId: string;
  organizationId: string;
  processingStatus: ProviderWebhookEventProcessingStatus;
  errorMessage?: string | null;
  errorDetails?: Record<string, unknown>;
  providerSyncIntentId?: string | null;
  providerSyncRunId?: string | null;
  nextRetryAt?: Date | null;
}) {
  const now = new Date();
  const isTerminal =
    input.processingStatus === "succeeded" ||
    input.processingStatus === "failed" ||
    input.processingStatus === "skipped";

  const [event] = await db
    .update(schema.providerWebhookEvents)
    .set({
      processingStatus: input.processingStatus,
      errorMessage: input.errorMessage ?? null,
      errorDetails: input.errorDetails ?? {},
      providerSyncIntentId: input.providerSyncIntentId ?? null,
      providerSyncRunId: input.providerSyncRunId ?? null,
      processedAt: isTerminal ? now : null,
      nextRetryAt: input.nextRetryAt ?? null,
      attemptCount:
        input.processingStatus === "failed" || input.processingStatus === "processing"
          ? sql`${schema.providerWebhookEvents.attemptCount} + 1`
          : undefined,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.providerWebhookEvents.id, input.eventId),
        eq(schema.providerWebhookEvents.organizationId, input.organizationId),
      ),
    )
    .returning();

  if (!event) {
    throw new Error("Provider webhook event not found");
  }

  return event;
}
