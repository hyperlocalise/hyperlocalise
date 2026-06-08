import { describe, expect, it } from "vite-plus/test";

import {
  hashContentfulWebhookSecret,
  isPublishFromHyperlocaliseWriteback,
  parseContentfulWebhookPayload,
  shouldDispatchContentfulWebhookEvent,
  verifyContentfulWebhookSecret,
} from "./webhook";

describe("contentful webhook helpers", () => {
  it("verifies webhook secrets against stored hashes", () => {
    const hash = hashContentfulWebhookSecret("super-secret");

    expect(
      verifyContentfulWebhookSecret({
        providedSecret: "super-secret",
        expectedSecretHash: hash,
      }),
    ).toBe(true);
    expect(
      verifyContentfulWebhookSecret({
        providedSecret: "wrong-secret",
        expectedSecretHash: hash,
      }),
    ).toBe(false);
  });

  it("extracts dedupe metadata without retaining raw payload content", () => {
    const headers = new Headers({
      "x-contentful-topic": "ContentManagement.Entry.publish",
      "x-contentful-webhook-delivery-id": "delivery-123",
    });
    const event = parseContentfulWebhookPayload({
      headers,
      body: {
        sys: {
          id: "entry-1",
          type: "Entry",
          revision: 7,
          publishedVersion: 12,
          contentType: { sys: { id: "helpCenterArticle" } },
          space: { sys: { id: "space-1" } },
          environment: { sys: { id: "master" } },
        },
        fields: {
          title: { "en-US": "Do not persist this title in the event log" },
        },
      },
    });

    expect(event).toMatchObject({
      eventType: "ContentManagement.Entry.publish",
      providerEventId: "delivery-123",
      dedupeKey: "delivery-123",
      entryId: "entry-1",
      contentTypeId: "helpCenterArticle",
      revision: 7,
      publishedVersion: 12,
    });
    expect(JSON.stringify(event.redactedPayload)).not.toContain("Do not persist");
  });

  it("dispatches publish events only", () => {
    const publishHeaders = new Headers({
      "x-contentful-topic": "ContentManagement.Entry.publish",
    });
    const saveHeaders = new Headers({
      "x-contentful-topic": "ContentManagement.Entry.save",
    });

    expect(
      shouldDispatchContentfulWebhookEvent(
        parseContentfulWebhookPayload({
          headers: publishHeaders,
          body: { sys: { id: "entry-1" } },
        }),
      ),
    ).toBe(true);

    expect(
      shouldDispatchContentfulWebhookEvent(
        parseContentfulWebhookPayload({
          headers: saveHeaders,
          body: { sys: { id: "entry-1" } },
        }),
      ),
    ).toBe(false);
  });

  it("detects publish events that match a recent Hyperlocalise writeback version", () => {
    const completedAt = new Date("2026-06-08T12:00:00.000Z");

    expect(
      isPublishFromHyperlocaliseWriteback({
        publishedVersion: 12,
        writebackContentfulVersion: 12,
        writebackCompletedAt: completedAt,
        now: new Date("2026-06-08T12:05:00.000Z"),
      }),
    ).toBe(true);

    expect(
      isPublishFromHyperlocaliseWriteback({
        publishedVersion: 13,
        writebackContentfulVersion: 12,
        writebackCompletedAt: completedAt,
        now: new Date("2026-06-08T12:05:00.000Z"),
      }),
    ).toBe(false);

    expect(
      isPublishFromHyperlocaliseWriteback({
        publishedVersion: 12,
        writebackContentfulVersion: 12,
        writebackCompletedAt: completedAt,
        now: new Date("2026-06-08T12:20:00.000Z"),
      }),
    ).toBe(false);
  });
});
