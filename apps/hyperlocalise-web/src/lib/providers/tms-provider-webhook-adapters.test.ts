import { createHmac } from "node:crypto";

import { describe, expect, it } from "vite-plus/test";

import {
  createProviderWebhookAdapter,
  tmsProviderWebhookAdapters,
  type ProviderWebhookPayload,
  type TmsWebhookMappedIntentKind,
} from "./tms-provider-webhook-adapters";
import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

function signatureFor(body: string, secret = "webhook-signing-secret") {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function extract(input: {
  providerKind: ExternalTmsProviderKind;
  payload: ProviderWebhookPayload;
  headers?: HeadersInit;
  providerWebhookId?: string;
}) {
  const adapter = tmsProviderWebhookAdapters[input.providerKind];
  const headers = new Headers(input.headers);
  headers.set("x-hyperlocalise-provider-webhook-id", input.providerWebhookId ?? "webhook-1");

  return adapter.extract({
    providerKind: input.providerKind,
    headers,
    payload: input.payload,
  });
}

describe("tms provider webhook adapters", () => {
  it.each<{
    providerKind: ExternalTmsProviderKind;
    payload: ProviderWebhookPayload;
    expected: {
      providerEventId: string;
      eventType: string;
      resourceId: string | null;
      externalResourceId: string | null;
      mappedIntentKinds: TmsWebhookMappedIntentKind[];
    };
  }>([
    {
      providerKind: "crowdin",
      payload: {
        event_id: "crowdin-event-1",
        event: "file.translated",
        file: { id: 123 },
        project: { id: 456 },
      },
      expected: {
        providerEventId: "crowdin-event-1",
        eventType: "file.translated",
        resourceId: "123",
        externalResourceId: "456",
        mappedIntentKinds: ["file_key_scan"],
      },
    },
    {
      providerKind: "phrase",
      payload: {
        event_uid: "phrase-event-1",
        event: "jobs:completed",
        job: { uid: "job-1" },
        project: { uid: "project-1" },
      },
      expected: {
        providerEventId: "phrase-event-1",
        eventType: "jobs:completed",
        resourceId: "job-1",
        externalResourceId: "project-1",
        mappedIntentKinds: ["job_task_scan"],
      },
    },
    {
      providerKind: "smartling",
      payload: {
        eventId: "smartling-event-1",
        eventType: "FILE_TRANSLATED",
        fileUri: "/locales/en.json",
        projectId: "smartling-project-1",
      },
      expected: {
        providerEventId: "smartling-event-1",
        eventType: "FILE_TRANSLATED",
        resourceId: "/locales/en.json",
        externalResourceId: "smartling-project-1",
        mappedIntentKinds: ["file_key_scan"],
      },
    },
    {
      providerKind: "smartling",
      payload: {
        type: "file.published",
        file: { fileUri: "/locales/en.json" },
        project: { projectUid: "smartling-project-1" },
      },
      expected: {
        providerEventId: "smartling-delivery-1",
        eventType: "file.published",
        resourceId: "/locales/en.json",
        externalResourceId: "smartling-project-1",
        mappedIntentKinds: ["file_key_scan"],
      },
    },
    {
      providerKind: "lokalise",
      payload: {
        uuid: "lokalise-event-1",
        event: "project.translation.updated",
        key: { id: 789 },
        project: { id: "lokalise-project-1" },
      },
      expected: {
        providerEventId: "lokalise-event-1",
        eventType: "project.translation.updated",
        resourceId: "789",
        externalResourceId: "lokalise-project-1",
        mappedIntentKinds: ["project_scan"],
      },
    },
  ])(
    "maps representative $providerKind payloads to reconciliation intents",
    ({ providerKind, payload, expected }) => {
      const headers =
        providerKind === "smartling" && expected.providerEventId === "smartling-delivery-1"
          ? { "event-id": "smartling-delivery-1" }
          : undefined;
      const descriptor = extract({ providerKind, payload, headers });

      expect(descriptor).toMatchObject({
        providerWebhookId: "webhook-1",
        providerEventId: expected.providerEventId,
        eventType: expected.eventType,
        dedupeKey: expected.providerEventId,
        resourceId: expected.resourceId,
        externalResourceId: expected.externalResourceId,
        ...(providerKind === "smartling" && expected.providerEventId === "smartling-delivery-1"
          ? { deliveryId: "smartling-delivery-1" }
          : {}),
      });
      expect(descriptor?.mappedIntents.map((intent) => intent.kind)).toEqual(
        expected.mappedIntentKinds,
      );
      expect(descriptor?.redactedPayload).toEqual({
        providerEventId: expected.providerEventId,
        deliveryId:
          providerKind === "smartling" && expected.providerEventId === "smartling-delivery-1"
            ? "smartling-delivery-1"
            : null,
        eventType: expected.eventType,
        resourceType: null,
        resourceId: expected.resourceId,
        externalResourceId: expected.externalResourceId,
        mappedIntentKinds: expected.mappedIntentKinds,
      });
    },
  );

  it.each<{
    eventType: string;
    expectedMappedIntentKinds: TmsWebhookMappedIntentKind[];
  }>([
    { eventType: "project.updated", expectedMappedIntentKinds: ["project_scan"] },
    { eventType: "file.updated", expectedMappedIntentKinds: ["file_key_scan"] },
    { eventType: "file.uploaded", expectedMappedIntentKinds: ["file_key_scan"] },
    { eventType: "file.pushed", expectedMappedIntentKinds: ["file_key_scan"] },
    { eventType: "task.created", expectedMappedIntentKinds: ["job_task_scan"] },
    { eventType: "translation_memory.updated", expectedMappedIntentKinds: ["tm_scan"] },
    { eventType: "glossary.updated", expectedMappedIntentKinds: ["glossary_scan"] },
    { eventType: "translation.completed", expectedMappedIntentKinds: ["project_scan"] },
    {
      eventType: "write_back.completed",
      expectedMappedIntentKinds: ["post_write_back_confirmation"],
    },
  ])("supports target intent $eventType", ({ eventType, expectedMappedIntentKinds }) => {
    const descriptor = extract({
      providerKind: "crowdin",
      payload: {
        event_id: `evt-${eventType}`,
        event: eventType,
        resource_id: "resource-1",
      },
    });

    expect(descriptor?.mappedIntents.map((intent) => intent.kind)).toEqual(
      expectedMappedIntentKinds,
    );
  });

  it("only maps pull content for job and task resources", () => {
    const descriptor = extract({
      providerKind: "crowdin",
      payload: {
        event_id: "evt-task-content",
        event: "task.translation.completed",
        resource_type: "task",
        resource_id: "task-1",
      },
    });

    expect(descriptor?.mappedIntents).toEqual([{ kind: "pull_content", resourceId: "task-1" }]);
  });

  it("dedupes mapped intents by resourceIds as well as kind and resourceId", () => {
    const adapter = createProviderWebhookAdapter({
      mapEvent() {
        return [
          { kind: "file_key_scan", resourceId: "file-1", resourceIds: ["key-1"] },
          { kind: "file_key_scan", resourceId: "file-1", resourceIds: ["key-2"] },
          { kind: "file_key_scan", resourceId: "file-1", resourceIds: ["key-1"] },
        ];
      },
    });

    const descriptor = adapter.extract({
      providerKind: "crowdin",
      headers: new Headers({ "x-hyperlocalise-provider-webhook-id": "webhook-1" }),
      payload: {
        event_id: "evt-resource-ids",
        event: "file.updated",
      },
    });

    expect(descriptor?.mappedIntents).toEqual([
      { kind: "file_key_scan", resourceId: "file-1", resourceIds: ["key-1"] },
      { kind: "file_key_scan", resourceId: "file-1", resourceIds: ["key-2"] },
    ]);
  });

  it("returns no sync intents for valid but unsupported provider events", () => {
    const descriptor = extract({
      providerKind: "crowdin",
      payload: {
        event_id: "evt-ping",
        event: "system.ping",
        resource_type: "webhook",
      },
    });

    expect(descriptor?.mappedIntents).toEqual([]);
  });

  it("verifies Smartling Event-Signature headers using the raw body", async () => {
    const payload = {
      type: "file.published",
      file: { fileUri: "/locales/en.json" },
      project: { projectUid: "smartling-project-1" },
    };
    const body = JSON.stringify(payload);
    const eventId = "evt-smartling-1";
    const eventTimestamp = String(Math.floor(Date.now() / 1000));
    const signedPayload = `${eventId}.${eventTimestamp}.${body}`;
    const signature = createHmac("sha256", "webhook-signing-secret")
      .update(signedPayload)
      .digest("hex");
    const adapter = tmsProviderWebhookAdapters.smartling;
    const descriptor = extract({
      providerKind: "smartling",
      payload,
      headers: {
        "event-id": eventId,
        "event-timestamp": eventTimestamp,
        "event-signature": signature,
      },
    });

    expect(descriptor).not.toBeNull();

    await expect(
      Promise.resolve(
        adapter.verify({
          providerKind: "smartling",
          headers: new Headers({
            "event-id": eventId,
            "event-timestamp": eventTimestamp,
            "event-signature": signature,
          }),
          rawBody: body,
          payload,
          webhookSecret: "webhook-signing-secret",
          descriptor: descriptor!,
        }),
      ),
    ).resolves.toBe(true);

    await expect(
      Promise.resolve(
        adapter.verify({
          providerKind: "smartling",
          headers: new Headers({
            "event-id": eventId,
            "event-timestamp": eventTimestamp,
            "event-signature": "deadbeef",
          }),
          rawBody: body,
          payload,
          webhookSecret: "webhook-signing-secret",
          descriptor: descriptor!,
        }),
      ),
    ).resolves.toBe(false);
  });

  it("rejects stale Smartling event timestamps before verifying signatures", async () => {
    const payload = {
      type: "file.published",
      file: { fileUri: "/locales/en.json" },
      project: { projectUid: "smartling-project-1" },
    };
    const body = JSON.stringify(payload);
    const eventId = "evt-smartling-stale";
    const eventTimestamp = String(Math.floor(Date.now() / 1000) - 301);
    const signedPayload = `${eventId}.${eventTimestamp}.${body}`;
    const signature = createHmac("sha256", "webhook-signing-secret")
      .update(signedPayload)
      .digest("hex");
    const adapter = tmsProviderWebhookAdapters.smartling;

    await expect(
      Promise.resolve(
        adapter.verify({
          providerKind: "smartling",
          headers: new Headers({
            "event-id": eventId,
            "event-timestamp": eventTimestamp,
            "event-signature": signature,
          }),
          rawBody: body,
          payload,
          webhookSecret: "webhook-signing-secret",
          descriptor: extract({ providerKind: "smartling", payload })!,
        }),
      ),
    ).resolves.toBe(false);
  });

  it("verifies Crowdin configured secret headers and body signatures", async () => {
    const payload = { event_id: "evt-signature", event: "file.updated" };
    const body = JSON.stringify(payload);
    const adapter = tmsProviderWebhookAdapters.crowdin;
    const descriptor = extract({ providerKind: "crowdin", payload });

    expect(descriptor).not.toBeNull();

    await expect(
      Promise.resolve(
        adapter.verify({
          providerKind: "crowdin",
          headers: new Headers({ "x-hyperlocalise-signature-256": signatureFor(body) }),
          rawBody: body,
          payload,
          webhookSecret: "webhook-signing-secret",
          descriptor: descriptor!,
        }),
      ),
    ).resolves.toBe(true);

    await expect(
      Promise.resolve(
        adapter.verify({
          providerKind: "crowdin",
          headers: new Headers({ "x-hyperlocalise-webhook-secret": "webhook-signing-secret" }),
          rawBody: body,
          payload,
          webhookSecret: "webhook-signing-secret",
          descriptor: descriptor!,
        }),
      ),
    ).resolves.toBe(true);

    await expect(
      Promise.resolve(
        adapter.verify({
          providerKind: "crowdin",
          headers: new Headers({ "x-hyperlocalise-webhook-secret": "wrong-secret" }),
          rawBody: body,
          payload,
          webhookSecret: "webhook-signing-secret",
          descriptor: descriptor!,
        }),
      ),
    ).resolves.toBe(false);
  });

  it("default verification rejects echoed secrets without body signatures", async () => {
    const payload = { event_uid: "evt-signature", event: "jobs:completed" };
    const body = JSON.stringify(payload);
    const adapter = tmsProviderWebhookAdapters.phrase;
    const descriptor = extract({ providerKind: "phrase", payload });

    expect(descriptor).not.toBeNull();

    await expect(
      Promise.resolve(
        adapter.verify({
          providerKind: "phrase",
          headers: new Headers({ "x-hyperlocalise-webhook-secret": "webhook-signing-secret" }),
          rawBody: body,
          payload,
          webhookSecret: "webhook-signing-secret",
          descriptor: descriptor!,
        }),
      ),
    ).resolves.toBe(false);
  });
});
