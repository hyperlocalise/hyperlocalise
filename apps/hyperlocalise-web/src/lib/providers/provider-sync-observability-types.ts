import type {
  ProviderSyncIntentStatus,
  ProviderSyncRunStatus,
  ProviderWebhookEventProcessingStatus,
  ProviderWebhookSubscriptionStatus,
} from "@/lib/database/types";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import type { ProviderWebhookSubscriptionSummary } from "./provider-webhook-subscription-types";

export type ProviderSyncObservabilityWebhookEventSummary = {
  id: string;
  eventType: string;
  processingStatus: ProviderWebhookEventProcessingStatus;
  providerSyncIntentId: string | null;
  providerSyncRunId: string | null;
  receivedAt: string;
  processedAt: string | null;
  errorMessage: string | null;
};

export type ProviderSyncObservabilityIntentSummary = {
  id: string;
  syncKind: string;
  status: ProviderSyncIntentStatus;
  cause: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  providerSyncRunId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canRetry: boolean;
};

export type ProviderSyncObservabilityRunSummary = {
  id: string;
  kind: string;
  status: ProviderSyncRunStatus;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
};

export type ProviderSyncObservabilityEntry = {
  projectId: string | null;
  subscription: ProviderWebhookSubscriptionSummary;
  automaticSyncActive: boolean;
  latestWebhookEvent: ProviderSyncObservabilityWebhookEventSummary | null;
  latestSyncIntent: ProviderSyncObservabilityIntentSummary | null;
  latestSyncRun: ProviderSyncObservabilityRunSummary | null;
};

export type ProviderSyncObservability = {
  providerKind: ExternalTmsProviderKind;
  entries: ProviderSyncObservabilityEntry[];
};

export function isAutomaticSyncActive(status: ProviderWebhookSubscriptionStatus) {
  return status === "active";
}
