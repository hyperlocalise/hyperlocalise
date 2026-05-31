import { and, eq, inArray, or, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type {
  ProviderWebhookEvent,
  ProviderWebhookSubscription,
  ProviderWebhookEventProcessingStatus,
  ProviderWebhookSubscriptionStatus,
} from "@/lib/database/types";
import { isErr } from "@/lib/primitives/result/results";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

type ProviderWebhookSecretMetadata = {
  maskedSecretSuffix?: string;
  encryptionAlgorithm?: string;
  keyVersion?: number;
};

export class ProviderWebhookEventNotFoundError extends Error {
  constructor() {
    super("Provider webhook event not found");
    this.name = "ProviderWebhookEventNotFoundError";
  }
}

/**
 * Subscription row with decrypted secret material for the inbound webhook route.
 * Keep this type server-side only; API responses should use summaries instead.
 */
export type ProviderWebhookSubscriptionWithSecret = ProviderWebhookSubscription & {
  webhookSecretPlaintext: string | null;
};

/**
 * Inserts a provider webhook subscription and encrypts the optional signing
 * secret. Callers should pass `status: "pending"` for setup flows that have not
 * confirmed provider-side creation yet.
 */
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
      ? unwrapProviderCredentialCrypto(encryptProviderCredential(input.webhookSecretPlaintext))
      : null;
  const secretMetadata: ProviderWebhookSecretMetadata = {
    ...input.secretMetadata,
    ...(encrypted
      ? {
          encryptionAlgorithm: encrypted.algorithm,
          keyVersion: encrypted.keyVersion,
        }
      : {}),
  };

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
      secretMetadata,
      webhookSecretCiphertext: encrypted?.ciphertext ?? null,
      webhookSecretIv: encrypted?.iv ?? null,
      webhookSecretAuthTag: encrypted?.authTag ?? null,
      webhookSecretKeyVersion: encrypted?.keyVersion ?? null,
    })
    .onConflictDoNothing({
      target: [
        schema.providerWebhookSubscriptions.providerCredentialId,
        schema.providerWebhookSubscriptions.projectId,
      ],
    })
    .returning();

  if (subscription) {
    return subscription;
  }

  const existing = await findProviderWebhookSubscriptionByCredentialProject({
    organizationId: input.organizationId,
    providerCredentialId: input.providerCredentialId,
    projectId: input.projectId ?? null,
  });

  if (!existing) {
    throw new Error("Failed to insert provider webhook subscription");
  }

  return existing;
}

/**
 * Applies partial updates to a subscription while preserving omitted fields.
 * Passing `webhookSecretPlaintext` rotates the encrypted signing secret and
 * stamps the encryption metadata used by later decrypt operations.
 */
export async function updateProviderWebhookSubscription(input: {
  subscriptionId: string;
  organizationId: string;
  status?: ProviderWebhookSubscriptionStatus;
  providerWebhookId?: string;
  endpointUrl?: string;
  subscribedEvents?: string[];
  manualFallback?: ProviderWebhookSubscription["manualFallback"];
  lastError?: string | null;
  lastAuditedAt?: Date | null;
  webhookSecretPlaintext?: string | null;
  secretMetadata?: ProviderWebhookSecretMetadata;
}) {
  const now = new Date();
  const encrypted =
    input.webhookSecretPlaintext != null && input.webhookSecretPlaintext.length > 0
      ? unwrapProviderCredentialCrypto(encryptProviderCredential(input.webhookSecretPlaintext))
      : null;

  const [subscription] = await db
    .update(schema.providerWebhookSubscriptions)
    .set({
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.providerWebhookId !== undefined
        ? { providerWebhookId: input.providerWebhookId }
        : {}),
      ...(input.endpointUrl !== undefined ? { endpointUrl: input.endpointUrl } : {}),
      ...(input.subscribedEvents !== undefined ? { subscribedEvents: input.subscribedEvents } : {}),
      ...(input.manualFallback !== undefined ? { manualFallback: input.manualFallback } : {}),
      ...(input.lastError !== undefined
        ? {
            lastError: input.lastError,
            lastErrorAt: input.lastError ? now : null,
          }
        : {}),
      ...(input.lastAuditedAt !== undefined ? { lastAuditedAt: input.lastAuditedAt } : {}),
      ...(encrypted
        ? {
            webhookSecretCiphertext: encrypted.ciphertext,
            webhookSecretIv: encrypted.iv,
            webhookSecretAuthTag: encrypted.authTag,
            webhookSecretKeyVersion: encrypted.keyVersion,
            secretMetadata: {
              ...input.secretMetadata,
              encryptionAlgorithm: encrypted.algorithm,
              keyVersion: encrypted.keyVersion,
            },
          }
        : {}),
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

/**
 * Compatibility wrapper for callers that only need to transition status-related
 * fields. New setup code should prefer `updateProviderWebhookSubscription`.
 */
export async function updateProviderWebhookSubscriptionStatus(input: {
  subscriptionId: string;
  organizationId: string;
  status: ProviderWebhookSubscriptionStatus;
  lastError?: string | null;
  manualFallback?: ProviderWebhookSubscription["manualFallback"];
  lastAuditedAt?: Date | null;
}) {
  return updateProviderWebhookSubscription(input);
}

/**
 * Lists subscriptions for a credential, optionally narrowed to a single project.
 * `projectId: null` intentionally means credential-level subscriptions.
 */
export async function listProviderWebhookSubscriptionsForCredential(input: {
  organizationId: string;
  providerCredentialId: string;
  projectId?: string | null;
}) {
  const conditions = [
    eq(schema.providerWebhookSubscriptions.organizationId, input.organizationId),
    eq(schema.providerWebhookSubscriptions.providerCredentialId, input.providerCredentialId),
  ];

  if (input.projectId !== undefined) {
    conditions.push(
      input.projectId === null
        ? sql`${schema.providerWebhookSubscriptions.projectId} is null`
        : eq(schema.providerWebhookSubscriptions.projectId, input.projectId),
    );
  }

  return db
    .select()
    .from(schema.providerWebhookSubscriptions)
    .where(and(...conditions));
}

/** Finds the existing subscription for a credential/project pair, if present. */
export async function findProviderWebhookSubscriptionByCredentialProject(input: {
  organizationId: string;
  providerCredentialId: string;
  projectId: string | null;
}) {
  const [subscription] = await listProviderWebhookSubscriptionsForCredential({
    organizationId: input.organizationId,
    providerCredentialId: input.providerCredentialId,
    projectId: input.projectId,
  });

  return subscription ?? null;
}

/**
 * Lists subscriptions that should be considered by audit jobs. Omitting filters
 * returns all subscriptions, which is useful for one-off maintenance scripts.
 */
export async function listProviderWebhookSubscriptionsForAudit(input: {
  organizationId?: string;
  statuses?: ProviderWebhookSubscriptionStatus[];
}) {
  const conditions = [];

  if (input.organizationId) {
    conditions.push(eq(schema.providerWebhookSubscriptions.organizationId, input.organizationId));
  }

  if (input.statuses && input.statuses.length > 0) {
    conditions.push(inArray(schema.providerWebhookSubscriptions.status, input.statuses));
  }

  return db
    .select()
    .from(schema.providerWebhookSubscriptions)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
}

/**
 * Decrypts a stored webhook signing secret. Returns null instead of throwing so
 * webhook intake can fail closed with `webhook_secret_unavailable`.
 */
export function decryptWebhookSecret(subscription: ProviderWebhookSubscription): string | null {
  if (
    !subscription.webhookSecretCiphertext ||
    !subscription.webhookSecretIv ||
    !subscription.webhookSecretAuthTag ||
    !subscription.webhookSecretKeyVersion
  ) {
    return null;
  }

  const decrypted = decryptProviderCredential({
    algorithm: subscription.secretMetadata.encryptionAlgorithm ?? "aes-256-gcm",
    keyVersion: subscription.webhookSecretKeyVersion,
    ciphertext: subscription.webhookSecretCiphertext,
    iv: subscription.webhookSecretIv,
    authTag: subscription.webhookSecretAuthTag,
  });
  if (isErr(decrypted)) {
    return null;
  }

  return decrypted.value;
}

/**
 * Resolves an active subscription by provider webhook id for inbound delivery
 * verification and includes the decrypted signing secret when available.
 */
export async function findActiveProviderWebhookSubscription(input: {
  providerKind: ExternalTmsProviderKind;
  providerWebhookId: string;
}): Promise<ProviderWebhookSubscriptionWithSecret | null> {
  const [subscription] = await db
    .select()
    .from(schema.providerWebhookSubscriptions)
    .where(
      and(
        eq(schema.providerWebhookSubscriptions.providerKind, input.providerKind),
        eq(schema.providerWebhookSubscriptions.providerWebhookId, input.providerWebhookId),
        eq(schema.providerWebhookSubscriptions.status, "active"),
      ),
    )
    .limit(1);

  if (!subscription) {
    return null;
  }

  return {
    ...subscription,
    webhookSecretPlaintext: decryptWebhookSecret(subscription),
  };
}

/**
 * Inserts a provider webhook event without dedupe handling. Prefer
 * `insertProviderWebhookEventIdempotent` for route intake.
 */
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

/**
 * Inserts a webhook event using subscription-local dedupe keys and returns the
 * existing row for duplicate deliveries. This lets retry logic distinguish
 * already-queued work from duplicates that still need enqueue recovery.
 */
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

/**
 * Updates webhook event processing state. Only succeeded/skipped events stamp
 * `processedAt`; failed events remain retryable and visibly incomplete.
 */
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
  const isProcessed =
    input.processingStatus === "succeeded" || input.processingStatus === "skipped";

  const [event] = await db
    .update(schema.providerWebhookEvents)
    .set({
      processingStatus: input.processingStatus,
      errorMessage: input.errorMessage ?? null,
      errorDetails: input.errorDetails ?? {},
      processedAt: isProcessed ? now : null,
      nextRetryAt: input.nextRetryAt ?? null,
      attemptCount:
        input.processingStatus === "processing"
          ? sql`${schema.providerWebhookEvents.attemptCount} + 1`
          : undefined,
      updatedAt: now,
      ...(input.providerSyncIntentId !== undefined
        ? { providerSyncIntentId: input.providerSyncIntentId }
        : {}),
      ...(input.providerSyncRunId !== undefined
        ? { providerSyncRunId: input.providerSyncRunId }
        : {}),
    })
    .where(
      and(
        eq(schema.providerWebhookEvents.id, input.eventId),
        eq(schema.providerWebhookEvents.organizationId, input.organizationId),
      ),
    )
    .returning();

  if (!event) {
    throw new ProviderWebhookEventNotFoundError();
  }

  return event;
}

/**
 * Backfills the reconciliation queue intent id after enqueue succeeds. This is
 * best-effort metadata used to avoid duplicate queueing on repeated deliveries.
 */
export async function updateProviderWebhookEventSyncIntent(input: {
  eventId: string;
  organizationId: string;
  providerSyncIntentId: string;
}): Promise<ProviderWebhookEvent | null> {
  const [event] = await db
    .update(schema.providerWebhookEvents)
    .set({
      providerSyncIntentId: input.providerSyncIntentId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.providerWebhookEvents.id, input.eventId),
        eq(schema.providerWebhookEvents.organizationId, input.organizationId),
      ),
    )
    .returning();

  return event ?? null;
}
