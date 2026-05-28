import { createHmac, timingSafeEqual } from "node:crypto";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import {
  isProviderSyncIntentKind,
  type ProviderSyncIntentKind,
} from "./provider-sync-intent-kinds";

export type ProviderWebhookPayload = Record<string, unknown>;

export type TmsWebhookSubscriptionHint = {
  providerWebhookId: string;
};

export type TmsWebhookResourceHint = {
  resourceType?: string | null;
  resourceId?: string | null;
  externalResourceId?: string | null;
};

export type TmsWebhookMappedIntentKind = ProviderSyncIntentKind | "post_write_back_confirmation";

export type TmsWebhookMappedIntent = {
  kind: TmsWebhookMappedIntentKind;
  resourceId?: string | null;
  resourceIds?: string[];
};

export type TmsWebhookExecutableIntent = TmsWebhookMappedIntent & {
  kind: ProviderSyncIntentKind;
};

export type TmsProviderWebhookDescriptor = TmsWebhookSubscriptionHint &
  TmsWebhookResourceHint & {
    providerEventId: string;
    eventType: string;
    dedupeKey: string;
    deliveryId: string | null;
    redactedPayload: Record<string, unknown>;
    mappedIntents: TmsWebhookMappedIntent[];
  };

export type TmsProviderWebhookAdapterInput = {
  providerKind: ExternalTmsProviderKind;
  headers: Headers;
  payload: ProviderWebhookPayload;
};

export type TmsProviderWebhookVerificationInput = TmsProviderWebhookAdapterInput & {
  rawBody: string;
  webhookSecret: string | null;
  descriptor: TmsProviderWebhookDescriptor;
};

export interface TmsProviderWebhookAdapter {
  resolveSubscription(input: TmsProviderWebhookAdapterInput): TmsWebhookSubscriptionHint | null;
  extractProviderEventId(input: TmsProviderWebhookAdapterInput): string | null;
  extractEventType(input: TmsProviderWebhookAdapterInput): string | null;
  extractResource(input: TmsProviderWebhookAdapterInput): TmsWebhookResourceHint;
  verify(input: TmsProviderWebhookVerificationInput): boolean | Promise<boolean>;
  redact(
    input: TmsProviderWebhookAdapterInput & { descriptor: TmsProviderWebhookDescriptor },
  ): Record<string, unknown>;
  mapToIntents(
    input: TmsProviderWebhookAdapterInput & { descriptor: TmsProviderWebhookDescriptor },
  ): TmsWebhookMappedIntent[];
  extract(input: TmsProviderWebhookAdapterInput): TmsProviderWebhookDescriptor | null;
}

export function isExecutableTmsWebhookMappedIntent(
  intent: TmsWebhookMappedIntent,
): intent is TmsWebhookExecutableIntent {
  return isProviderSyncIntentKind(intent.kind);
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function getPath(value: unknown, path: readonly string[]): unknown {
  let current = value;

  for (const segment of path) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function readSignature(headers: Headers) {
  const signature =
    headers.get("x-hyperlocalise-signature-256") ?? headers.get("x-provider-signature-256");

  if (!signature) {
    return null;
  }

  return signature.startsWith("sha256=") ? signature.slice("sha256=".length) : signature;
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyHmacSha256(input: { rawBody: string; webhookSecret: string; signature: string }) {
  const expected = createHmac("sha256", input.webhookSecret).update(input.rawBody).digest("hex");

  if (input.signature.length !== expected.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(input.signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function verifyHmacSha256Hex(input: { payload: string; webhookSecret: string; signature: string }) {
  const expected = createHmac("sha256", input.webhookSecret).update(input.payload).digest("hex");

  if (input.signature.length !== expected.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(input.signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function defaultVerify({ headers, rawBody, webhookSecret }: TmsProviderWebhookVerificationInput) {
  if (!webhookSecret) {
    return true;
  }

  const signature = readSignature(headers);
  if (!signature) {
    return false;
  }

  return verifyHmacSha256({ rawBody, webhookSecret, signature });
}

export function verifySmartlingWebhook(input: TmsProviderWebhookVerificationInput) {
  if (!input.webhookSecret) {
    return true;
  }

  const eventId = input.headers.get("event-id");
  const eventTimestamp = input.headers.get("event-timestamp");
  const eventSignature = input.headers.get("event-signature");

  if (eventId && eventTimestamp && eventSignature) {
    const signedPayload = `${eventId}.${eventTimestamp}.${input.rawBody}`;
    const signatures = eventSignature.trim().split(/\s+/);

    return signatures.some((signature) =>
      verifyHmacSha256Hex({
        payload: signedPayload,
        webhookSecret: input.webhookSecret!,
        signature,
      }),
    );
  }

  return verifyCrowdinWebhook(input);
}

function verifyCrowdinWebhook(input: TmsProviderWebhookVerificationInput) {
  if (!input.webhookSecret) {
    return true;
  }

  const signature = readSignature(input.headers);
  if (signature) {
    return verifyHmacSha256({
      rawBody: input.rawBody,
      webhookSecret: input.webhookSecret,
      signature,
    });
  }

  const echoedSecret = input.headers.get("x-hyperlocalise-webhook-secret");
  if (!echoedSecret) {
    return false;
  }

  return constantTimeEqual(echoedSecret, input.webhookSecret);
}

function dedupeIntents(intents: TmsWebhookMappedIntent[]) {
  const seen = new Set<string>();
  const deduped: TmsWebhookMappedIntent[] = [];

  for (const intent of intents) {
    const key = JSON.stringify({
      kind: intent.kind,
      resourceId: intent.resourceId ?? null,
      resourceIds: intent.resourceIds ?? [],
    });
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(intent);
  }

  return deduped;
}

function baseRedactedPayload(descriptor: TmsProviderWebhookDescriptor) {
  return {
    providerEventId: descriptor.providerEventId,
    deliveryId: descriptor.deliveryId,
    eventType: descriptor.eventType,
    resourceType: descriptor.resourceType ?? null,
    resourceId: descriptor.resourceId ?? null,
    externalResourceId: descriptor.externalResourceId ?? null,
    mappedIntentKinds: descriptor.mappedIntents.map((intent) => intent.kind),
  };
}

export type ProviderWebhookAdapterConfig = {
  subscriptionIdPaths?: readonly (readonly string[])[];
  eventIdHeaders?: readonly string[];
  eventIdPaths?: readonly (readonly string[])[];
  deliveryIdHeaders?: readonly string[];
  deliveryIdPaths?: readonly (readonly string[])[];
  eventTypePaths?: readonly (readonly string[])[];
  resourceTypePaths?: readonly (readonly string[])[];
  resourceIdPaths?: readonly (readonly string[])[];
  externalResourceIdPaths?: readonly (readonly string[])[];
  verify?: TmsProviderWebhookAdapter["verify"];
  mapEvent: (input: {
    eventType: string;
    resourceType: string | null;
    resourceId: string | null;
  }) => TmsWebhookMappedIntent[];
};

const defaultPaths = {
  subscriptionId: [["provider_webhook_id"], ["webhook_id"], ["webhook", "id"]],
  eventId: [["provider_event_id"], ["event_id"], ["id"], ["uuid"]],
  deliveryId: [["delivery_id"]],
  eventType: [["event_type"], ["event"], ["type"]],
  resourceType: [["resource_type"], ["resource"]],
  resourceId: [["resource_id"]],
  externalResourceId: [["external_resource_id"]],
} as const;

function firstPathString(payload: ProviderWebhookPayload, paths: readonly (readonly string[])[]) {
  return firstString(...paths.map((path) => getPath(payload, path)));
}

export function createProviderWebhookAdapter(
  config: ProviderWebhookAdapterConfig,
): TmsProviderWebhookAdapter {
  const adapter: TmsProviderWebhookAdapter = {
    resolveSubscription({ headers, payload }) {
      const providerWebhookId = firstString(
        headers.get("x-hyperlocalise-provider-webhook-id"),
        headers.get("x-provider-webhook-id"),
        firstPathString(payload, config.subscriptionIdPaths ?? defaultPaths.subscriptionId),
      );

      return providerWebhookId ? { providerWebhookId } : null;
    },
    extractProviderEventId({ headers, payload }) {
      return firstString(
        ...(config.eventIdHeaders ?? []).map((headerName) => headers.get(headerName)),
        headers.get("x-hyperlocalise-provider-event-id"),
        headers.get("x-provider-event-id"),
        headers.get("x-webhook-event-id"),
        firstPathString(payload, config.eventIdPaths ?? defaultPaths.eventId),
      );
    },
    extractEventType({ headers, payload }) {
      return firstString(
        headers.get("x-provider-event-type"),
        firstPathString(payload, config.eventTypePaths ?? defaultPaths.eventType),
      );
    },
    extractResource({ payload }) {
      const resourceType = firstPathString(
        payload,
        config.resourceTypePaths ?? defaultPaths.resourceType,
      );
      const resourceId = firstPathString(
        payload,
        config.resourceIdPaths ?? defaultPaths.resourceId,
      );
      const externalResourceId = firstPathString(
        payload,
        config.externalResourceIdPaths ?? defaultPaths.externalResourceId,
      );

      return { resourceType, resourceId, externalResourceId };
    },
    verify: config.verify ?? defaultVerify,
    redact({ descriptor }) {
      return baseRedactedPayload(descriptor);
    },
    mapToIntents({ descriptor }) {
      return dedupeIntents(
        config.mapEvent({
          eventType: descriptor.eventType,
          resourceType: descriptor.resourceType ?? null,
          resourceId: descriptor.resourceId ?? null,
        }),
      );
    },
    extract(input) {
      const subscription = adapter.resolveSubscription(input);
      const providerEventId = adapter.extractProviderEventId(input);
      const eventType = adapter.extractEventType(input);

      if (!subscription || !providerEventId || !eventType) {
        return null;
      }

      const deliveryId = firstString(
        ...(config.deliveryIdHeaders ?? []).map((headerName) => input.headers.get(headerName)),
        input.headers.get("x-hyperlocalise-delivery-id"),
        input.headers.get("x-provider-delivery-id"),
        input.headers.get("x-delivery-id"),
        firstPathString(input.payload, config.deliveryIdPaths ?? defaultPaths.deliveryId),
      );
      const resource = adapter.extractResource(input);
      const descriptor: TmsProviderWebhookDescriptor = {
        ...subscription,
        providerEventId,
        eventType,
        dedupeKey: firstString(input.payload["dedupe_key"], providerEventId) ?? providerEventId,
        deliveryId,
        ...resource,
        redactedPayload: {},
        mappedIntents: [],
      };

      descriptor.mappedIntents = adapter.mapToIntents({ ...input, descriptor });
      descriptor.redactedPayload = adapter.redact({ ...input, descriptor });

      return descriptor;
    },
  };

  return adapter;
}

function includesAny(value: string, tokens: readonly string[]) {
  return tokens.some((token) => value.includes(token));
}

function projectScan(resourceId?: string | null): TmsWebhookMappedIntent {
  return { kind: "project_scan", resourceId };
}

function fileKeyScan(resourceId?: string | null): TmsWebhookMappedIntent {
  return { kind: "file_key_scan", resourceId };
}

function jobTaskScan(resourceId?: string | null): TmsWebhookMappedIntent {
  return { kind: "job_task_scan", resourceId };
}

function tmScan(resourceId?: string | null): TmsWebhookMappedIntent {
  return { kind: "tm_scan", resourceId };
}

function glossaryScan(resourceId?: string | null): TmsWebhookMappedIntent {
  return { kind: "glossary_scan", resourceId };
}

function pullContent(resourceId?: string | null): TmsWebhookMappedIntent {
  return { kind: "pull_content", resourceId };
}

function postWriteBackConfirmation(resourceId?: string | null): TmsWebhookMappedIntent {
  return { kind: "post_write_back_confirmation", resourceId };
}

function genericTmsEventMapping(input: {
  eventType: string;
  resourceType: string | null;
  resourceId: string | null;
}) {
  const eventType = input.eventType.toLowerCase();
  const resourceType = input.resourceType?.toLowerCase() ?? null;
  const resourceId = input.resourceId;

  // Provider confirmation events are valid intake signals, but the current
  // provider sync dispatcher only supports initiating write-back, not confirming
  // a write-back that already happened.
  if (
    includesAny(eventType, ["write_back", "writeback"]) ||
    (eventType.includes("translation") && eventType.includes("push"))
  ) {
    return [postWriteBackConfirmation(resourceId)];
  }

  if (
    (resourceType === "job" || resourceType === "task") &&
    (includesAny(eventType, ["translation", "content"]) || eventType.includes("approved"))
  ) {
    return [pullContent(resourceId)];
  }

  if (eventType.startsWith("project.") || resourceType === "project") {
    return [projectScan(resourceId)];
  }
  if (
    includesAny(eventType, ["file", "string", "key", "source"]) ||
    resourceType === "file" ||
    resourceType === "key"
  ) {
    return [fileKeyScan(resourceId)];
  }
  if (
    includesAny(eventType, ["job", "task"]) ||
    resourceType === "job" ||
    resourceType === "task"
  ) {
    return [jobTaskScan(resourceId)];
  }
  if (
    includesAny(eventType, ["glossary", "term", "term_base", "termbase"]) ||
    resourceType === "glossary" ||
    resourceType === "term_base"
  ) {
    return [glossaryScan(resourceId)];
  }
  if (
    includesAny(eventType, ["translation_memory", "tm", "memory"]) ||
    resourceType === "translation_memory" ||
    resourceType === "tm"
  ) {
    return [tmScan(resourceId)];
  }
  if (includesAny(eventType, ["translated", "translation.updated", "translation.completed"])) {
    return [projectScan(null)];
  }

  return [];
}

export const crowdinWebhookAdapter = createProviderWebhookAdapter({
  eventTypePaths: [["event"], ["event_type"], ["type"]],
  eventIdPaths: [["event_id"], ["id"], ["uuid"]],
  resourceTypePaths: [["resource_type"], ["resource"], ["file", "type"]],
  resourceIdPaths: [["resource_id"], ["file", "id"], ["string", "id"], ["task", "id"]],
  externalResourceIdPaths: [["external_resource_id"], ["project", "id"]],
  mapEvent: genericTmsEventMapping,
  verify: verifyCrowdinWebhook,
});

export const phraseWebhookAdapter = createProviderWebhookAdapter({
  eventTypePaths: [["event"], ["event_type"], ["type"]],
  eventIdPaths: [["event_uid"], ["event_id"], ["id"], ["uuid"]],
  resourceTypePaths: [["resource_type"], ["resource", "type"]],
  resourceIdPaths: [["resource_id"], ["job", "uid"], ["job", "id"], ["key", "id"]],
  externalResourceIdPaths: [["external_resource_id"], ["project", "uid"], ["project", "id"]],
  mapEvent: genericTmsEventMapping,
});

export const smartlingWebhookAdapter = createProviderWebhookAdapter({
  subscriptionIdPaths: [["subscriptionUid"], ["subscription", "subscriptionUid"]],
  eventIdHeaders: ["event-id"],
  deliveryIdHeaders: ["event-id"],
  eventTypePaths: [["type"], ["eventType"], ["event_type"], ["event"]],
  eventIdPaths: [["eventId"], ["event_id"], ["id"]],
  resourceTypePaths: [
    ["resource_type"],
    ["resourceType"],
    ["entityType"],
    ["file", "type"],
    ["job", "type"],
  ],
  resourceIdPaths: [
    ["resource_id"],
    ["fileUri"],
    ["file", "fileUri"],
    ["file", "uri"],
    ["translationJobUid"],
    ["jobUid"],
    ["job", "uid"],
    ["job", "translationJobUid"],
  ],
  externalResourceIdPaths: [
    ["external_resource_id"],
    ["projectId"],
    ["projectUid"],
    ["project", "projectUid"],
    ["project", "id"],
  ],
  mapEvent: genericTmsEventMapping,
  verify: verifySmartlingWebhook,
});

export const lokaliseWebhookAdapter = createProviderWebhookAdapter({
  eventTypePaths: [["event"], ["event_type"], ["type"]],
  eventIdPaths: [["uuid"], ["event_id"], ["id"]],
  resourceTypePaths: [["resource_type"], ["object_type"]],
  resourceIdPaths: [["resource_id"], ["file", "id"], ["key", "id"], ["task", "id"]],
  externalResourceIdPaths: [["external_resource_id"], ["project", "id"], ["project_id"]],
  mapEvent: genericTmsEventMapping,
});

export const tmsProviderWebhookAdapters = {
  crowdin: crowdinWebhookAdapter,
  phrase: phraseWebhookAdapter,
  smartling: smartlingWebhookAdapter,
  lokalise: lokaliseWebhookAdapter,
} satisfies Record<ExternalTmsProviderKind, TmsProviderWebhookAdapter>;

export function getTmsProviderWebhookAdapter(providerKind: ExternalTmsProviderKind) {
  return tmsProviderWebhookAdapters[providerKind];
}
