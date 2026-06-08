import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { ContentfulWebhookEvent } from "./types";

export const CONTENTFUL_ENTRY_PUBLISH_TOPIC = "ContentManagement.Entry.publish";

const WRITEABACK_LOOP_GUARD_WINDOW_MS = 15 * 60 * 1000;

const contentfulWebhookPayloadSchema = z.object({
  sys: z
    .object({
      id: z.string().optional(),
      type: z.string().optional(),
      revision: z.number().int().optional(),
      publishedVersion: z.number().int().optional(),
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

export function shouldDispatchContentfulWebhookEvent(event: ContentfulWebhookEvent) {
  return event.eventType === CONTENTFUL_ENTRY_PUBLISH_TOPIC;
}

export function isPublishFromHyperlocaliseWriteback(input: {
  publishedVersion: number | null;
  writebackContentfulVersion: number | null;
  writebackCompletedAt: Date | null;
  now?: Date;
}) {
  if (
    input.publishedVersion === null ||
    input.writebackContentfulVersion === null ||
    input.writebackCompletedAt === null
  ) {
    return false;
  }
  if (input.publishedVersion !== input.writebackContentfulVersion) {
    return false;
  }
  const now = input.now ?? new Date();
  return now.getTime() - input.writebackCompletedAt.getTime() <= WRITEABACK_LOOP_GUARD_WINDOW_MS;
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
  const publishedVersion = sys?.publishedVersion ?? null;
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
    publishedVersion,
    redactedPayload: {
      eventType: topic,
      entryId,
      contentTypeId,
      revision,
      publishedVersion,
      spaceId: sys?.space?.sys?.id ?? null,
      environmentId: sys?.environment?.sys?.id ?? null,
    },
  };
}
