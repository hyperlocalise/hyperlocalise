import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { ContentfulWebhookEvent } from "./types";

export const CONTENTFUL_ENTRY_PUBLISH_TOPIC = "ContentManagement.Entry.publish";
export const HYPERLOCALISE_CONTENTFUL_WRITEBACK_HEADER = "x-hyperlocalise-contentful-writeback";

const contentfulWebhookPayloadSchema = z.object({
  sys: z
    .object({
      id: z.string().optional(),
      type: z.string().optional(),
      revision: z.number().int().optional(),
      contentType: z
        .object({
          sys: z
            .object({
              id: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
      space: z
        .object({
          sys: z
            .object({
              id: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
      environment: z
        .object({
          sys: z
            .object({
              id: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export function hashContentfulWebhookSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function safeTimingEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a, "hex");
  const bBuffer = Buffer.from(b, "hex");
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

export function verifyContentfulWebhookSecret(input: {
  providedSecret: string | null;
  expectedSecretHash: string;
}) {
  if (!input.providedSecret) {
    return false;
  }
  return safeTimingEqual(
    hashContentfulWebhookSecret(input.providedSecret),
    input.expectedSecretHash,
  );
}

function readHeader(headers: Headers, name: string) {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? headers.get(name.toUpperCase());
}

export function readContentfulWebhookSecret(headers: Headers) {
  return (
    readHeader(headers, "x-hyperlocalise-webhook-secret") ??
    readHeader(headers, "x-contentful-webhook-secret")
  );
}

export function isHyperlocaliseContentfulWriteback(headers: Headers) {
  return readHeader(headers, HYPERLOCALISE_CONTENTFUL_WRITEBACK_HEADER) === "true";
}

export function shouldDispatchContentfulWebhookEvent(input: {
  event: ContentfulWebhookEvent;
  headers: Headers;
}) {
  return (
    input.event.eventType === CONTENTFUL_ENTRY_PUBLISH_TOPIC &&
    !isHyperlocaliseContentfulWriteback(input.headers)
  );
}

export function parseContentfulWebhookPayload(input: {
  body: unknown;
  headers: Headers;
}): ContentfulWebhookEvent {
  const parsed = contentfulWebhookPayloadSchema.safeParse(input.body);
  const sys = parsed.success ? parsed.data.sys : undefined;
  const deliveryId = readHeader(input.headers, "x-contentful-webhook-delivery-id");
  const topic = readHeader(input.headers, "x-contentful-topic") ?? sys?.type ?? "unknown";
  const entryId = sys?.id ?? null;
  const contentTypeId = sys?.contentType?.sys?.id ?? null;
  const revision = sys?.revision ?? null;
  const providerEventId = deliveryId ?? null;
  const dedupeKey =
    providerEventId ??
    [
      topic,
      entryId ?? "unknown-entry",
      contentTypeId ?? "unknown-content-type",
      revision ?? "0",
    ].join(":");

  return {
    eventType: topic,
    providerEventId,
    dedupeKey,
    entryId,
    contentTypeId,
    revision,
    redactedPayload: {
      eventType: topic,
      entryId,
      contentTypeId,
      revision,
      spaceId: sys?.space?.sys?.id ?? null,
      environmentId: sys?.environment?.sys?.id ?? null,
    },
  };
}
