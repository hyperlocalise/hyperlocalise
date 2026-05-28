import type { ProviderWebhookSubscriptionStatus } from "@/lib/database/types";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export type ProviderWebhookManualFallback = {
  webhookUrl: string;
  secretHeaderName?: string;
  secretInstructions?: string;
  subscribedEvents: string[];
  lastError?: string;
};

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

export type ProviderWebhookSubscriptionSetupResult = {
  subscription: ProviderWebhookSubscriptionSummary;
  status: ProviderWebhookSubscriptionStatus;
};

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

export type ProviderWebhookRemoteSubscription = {
  providerWebhookId: string;
  endpointUrl: string;
  subscribedEvents: string[];
  isActive: boolean;
  secret?: string | null;
};

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

export interface ProviderWebhookSubscriptionAdapter {
  supportsAutomaticSetup: boolean;
  listRemoteSubscriptions(
    context: ProviderWebhookSubscriptionAdapterContext,
  ): Promise<ProviderWebhookRemoteSubscription[]>;
  createRemoteSubscription(
    context: ProviderWebhookSubscriptionAdapterContext,
  ): Promise<ProviderWebhookRemoteSubscription>;
  updateRemoteSubscription(
    context: ProviderWebhookSubscriptionAdapterContext & {
      providerWebhookId: string;
    },
  ): Promise<ProviderWebhookRemoteSubscription>;
  disableRemoteSubscription(
    context: ProviderWebhookSubscriptionAdapterContext & {
      providerWebhookId: string;
    },
  ): Promise<void>;
  deleteRemoteSubscription(
    context: ProviderWebhookSubscriptionAdapterContext & {
      providerWebhookId: string;
    },
  ): Promise<void>;
}
