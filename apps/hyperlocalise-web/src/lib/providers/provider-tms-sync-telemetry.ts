import { createLogger } from "@/lib/log";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export const TMS_SYNC_TELEMETRY_EVENTS = {
  webhookAccepted: "webhook_accepted",
  webhookDuplicate: "duplicate",
  webhookIgnored: "ignored",
  webhookVerificationFailed: "verification_failed",
  intentEnqueued: "intent_enqueued",
  reconciliationSucceeded: "reconciliation_succeeded",
  reconciliationFailed: "reconciliation_failed",
} as const;

export type TmsSyncTelemetryEvent =
  (typeof TMS_SYNC_TELEMETRY_EVENTS)[keyof typeof TMS_SYNC_TELEMETRY_EVENTS];

type TmsSyncTelemetryContext = {
  providerKind: ExternalTmsProviderKind;
  organizationId?: string;
  subscriptionId?: string;
  providerWebhookEventId?: string;
  providerSyncIntentId?: string;
  providerSyncRunId?: string;
  providerEventId?: string;
  deliveryId?: string | null;
  eventType?: string;
  processingStatus?: string;
  syncKind?: string;
  reason?: string;
};

const logger = createLogger("tms-sync-telemetry");

function logTelemetry(event: TmsSyncTelemetryEvent, context: TmsSyncTelemetryContext) {
  logger.info({ event, ...context }, event);
}

export function logWebhookAccepted(context: TmsSyncTelemetryContext) {
  logTelemetry(TMS_SYNC_TELEMETRY_EVENTS.webhookAccepted, context);
}

export function logWebhookDuplicate(context: TmsSyncTelemetryContext) {
  logTelemetry(TMS_SYNC_TELEMETRY_EVENTS.webhookDuplicate, context);
}

export function logWebhookIgnored(context: TmsSyncTelemetryContext) {
  logTelemetry(TMS_SYNC_TELEMETRY_EVENTS.webhookIgnored, context);
}

export function logWebhookVerificationFailed(context: TmsSyncTelemetryContext) {
  logTelemetry(TMS_SYNC_TELEMETRY_EVENTS.webhookVerificationFailed, context);
}

export function logIntentEnqueued(context: TmsSyncTelemetryContext) {
  logTelemetry(TMS_SYNC_TELEMETRY_EVENTS.intentEnqueued, context);
}

export function logReconciliationSucceeded(context: TmsSyncTelemetryContext) {
  logTelemetry(TMS_SYNC_TELEMETRY_EVENTS.reconciliationSucceeded, context);
}

export function logReconciliationFailed(context: TmsSyncTelemetryContext) {
  logTelemetry(TMS_SYNC_TELEMETRY_EVENTS.reconciliationFailed, context);
}
