import type { ProviderWebhookSubscriptionStatus } from "@/lib/database/types";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

/**
 * Manual setup details shown when Hyperlocalise cannot configure a provider
 * webhook through that provider's API. Provider-specific tickets can add richer
 * instructions while preserving this response shape.
 */
export type ProviderWebhookManualFallback = {
  webhookUrl: string;
  secretHeaderName?: string;
  secretInstructions?: string;
  subscribedEvents: string[];
  lastError?: string;
};

/**
 * API-safe subscription summary for integrations screens and retry flows. Secret
 * material and encrypted columns are intentionally excluded.
 */
export type ProviderWebhookSubscriptionSummary = {
  id: string;
  organizationId: string;
  providerCredentialId: string;
  projectId: string | null;
  providerKind: ExternalTmsProviderKind;
  providerWebhookId: string;
  endpointUrl: string;
  subscribedEvents: string[];
  status: ProviderWebhookSubscriptionStatus;
  manualFallback: ProviderWebhookManualFallback | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastAuditedAt: string | null;
  updatedAt: string;
  canRetry: boolean;
};

/** Result returned after attempting to create or refresh a subscription. */
export type ProviderWebhookSubscriptionSetupResult = {
  subscription: ProviderWebhookSubscriptionSummary;
  status: ProviderWebhookSubscriptionStatus;
};

/** Single audit decision for a stored subscription. */
export type ProviderWebhookSubscriptionAuditResult = {
  subscriptionId: string;
  action: "unchanged" | "reconciled" | "disabled" | "marked_stale";
  status: ProviderWebhookSubscriptionStatus;
};

export type ProviderWebhookSubscriptionAdapterErrorCode =
  | "permission_denied"
  | "provider_error"
  | "not_supported"
  | "invalid_configuration";

/**
 * Normalized provider-adapter failure. The manager maps these codes onto stored
 * subscription statuses and keeps the provider error detail in manual fallback
 * state so sync can continue.
 */
export class ProviderWebhookSubscriptionAdapterError extends Error {
  readonly code: ProviderWebhookSubscriptionAdapterErrorCode;
  readonly httpStatus?: number;

  constructor(
    code: ProviderWebhookSubscriptionAdapterErrorCode,
    message: string,
    options?: { httpStatus?: number; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "ProviderWebhookSubscriptionAdapterError";
    this.code = code;
    this.httpStatus = options?.httpStatus;
  }
}

/**
 * Provider-side webhook representation after an adapter reads, creates, or
 * updates a remote subscription.
 */
export type ProviderWebhookRemoteSubscription = {
  providerWebhookId: string;
  endpointUrl: string;
  subscribedEvents: string[];
  isActive: boolean;
  secret?: string | null;
};

/**
 * Context passed to provider-specific webhook adapters. The shared manager owns
 * persistence, secret generation, credential decryption, and fallback handling;
 * adapters should only translate this context into provider API calls.
 */
export type ProviderWebhookSubscriptionAdapterContext = {
  organizationId: string;
  providerCredentialId: string;
  providerKind: ExternalTmsProviderKind;
  projectId: string | null;
  externalProjectId: string | null;
  secretMaterial: string;
  baseUrl: string | null;
  region: string | null;
  endpointUrl: string;
  webhookSecret: string;
  subscribedEvents: string[];
  fetchFn?: typeof fetch;
};

/**
 * Provider boundary for automatic webhook setup. Implementations must not write
 * local subscription rows directly; they return the remote subscription state so
 * the shared manager can persist status consistently.
 */
export interface ProviderWebhookSubscriptionAdapter {
  /** Whether this adapter can configure remote webhooks without manual user setup. */
  supportsAutomaticSetup: boolean;

  /** List remote webhooks for audit and stale-subscription reconciliation. */
  listRemoteSubscriptions(
    context: ProviderWebhookSubscriptionAdapterContext,
  ): Promise<ProviderWebhookRemoteSubscription[]>;

  /** Create a provider webhook pointing at Hyperlocalise's shared intake route. */
  createRemoteSubscription(
    context: ProviderWebhookSubscriptionAdapterContext,
  ): Promise<ProviderWebhookRemoteSubscription>;

  /** Update endpoint, events, activation state, or secret for a remote webhook. */
  updateRemoteSubscription(
    context: ProviderWebhookSubscriptionAdapterContext & {
      providerWebhookId: string;
    },
  ): Promise<ProviderWebhookRemoteSubscription>;

  /** Disable a remote webhook while retaining enough provider state for audit. */
  disableRemoteSubscription(
    context: ProviderWebhookSubscriptionAdapterContext & {
      providerWebhookId: string;
    },
  ): Promise<void>;

  /** Delete a remote webhook if a provider supports hard removal. */
  deleteRemoteSubscription(
    context: ProviderWebhookSubscriptionAdapterContext & {
      providerWebhookId: string;
    },
  ): Promise<void>;
}
