/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { withPublicHttpFetch } from "@/lib/security/public-http-fetch";

vi.mock("@/lib/database/client", () => ({
  db: {},
  schema: {},
}));

vi.mock("@/lib/security/provider-credential-crypto", () => ({
  decryptProviderCredential: vi.fn(),
}));

vi.mock("@/lib/security/public-http-fetch", () => ({
  withPublicHttpFetch: vi.fn(),
}));

import type { JobChangeEventType } from "@/lib/job-change-events/job-change-events-contract";

import {
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_DELAYS_MS,
  defaultWebhookSender,
  nextWebhookAttemptDelayMs,
  webhookEndpointAcceptsEvent,
} from "./webhook-deliveries";

describe("webhookEndpointAcceptsEvent", () => {
  const event = { type: "job.status_changed" as const, projectId: "proj-1" };

  it("rejects a disabled endpoint even when the event otherwise matches", () => {
    expect(
      webhookEndpointAcceptsEvent(
        { eventTypes: [], projectId: null, disabledAt: new Date("2026-11-09T00:00:00.000Z") },
        event,
      ),
    ).toBe(false);
  });

  it("keeps project-scoped endpoints from seeing other projects", () => {
    expect(
      webhookEndpointAcceptsEvent({ eventTypes: [], projectId: "proj-2", disabledAt: null }, event),
    ).toBe(false);
    expect(
      webhookEndpointAcceptsEvent({ eventTypes: [], projectId: "proj-1", disabledAt: null }, event),
    ).toBe(true);
  });

  it("lets an org-wide endpoint with no event-type filter accept every event", () => {
    expect(
      webhookEndpointAcceptsEvent({ eventTypes: [], projectId: null, disabledAt: null }, event),
    ).toBe(true);
    expect(
      webhookEndpointAcceptsEvent(
        { eventTypes: [], projectId: null, disabledAt: null },
        { type: "job.created", projectId: null },
      ),
    ).toBe(true);
  });

  it("filters by event type when the endpoint lists them", () => {
    const endpoint = {
      eventTypes: ["job.created", "job.assignee_changed"] as JobChangeEventType[],
      projectId: null,
      disabledAt: null,
    };
    expect(webhookEndpointAcceptsEvent(endpoint, event)).toBe(false);
    expect(
      webhookEndpointAcceptsEvent(endpoint, { type: "job.assignee_changed", projectId: "proj-9" }),
    ).toBe(true);
  });
});

describe("nextWebhookAttemptDelayMs", () => {
  it("schedules the first retry after the first failed attempt", () => {
    expect(nextWebhookAttemptDelayMs(1)).toBe(WEBHOOK_RETRY_DELAYS_MS[0]);
    expect(nextWebhookAttemptDelayMs(2)).toBe(WEBHOOK_RETRY_DELAYS_MS[1]);
  });

  it("stops retrying once the last attempt has been used", () => {
    expect(WEBHOOK_MAX_ATTEMPTS).toBe(WEBHOOK_RETRY_DELAYS_MS.length + 1);
    expect(nextWebhookAttemptDelayMs(WEBHOOK_RETRY_DELAYS_MS.length)).toBe(
      WEBHOOK_RETRY_DELAYS_MS.at(-1),
    );
    expect(nextWebhookAttemptDelayMs(WEBHOOK_MAX_ATTEMPTS)).toBeNull();
    expect(nextWebhookAttemptDelayMs(0)).toBeNull();
  });
});

describe("defaultWebhookSender", () => {
  afterEach(() => {
    vi.mocked(withPublicHttpFetch).mockReset();
  });

  const request = {
    url: "https://hooks.example.com/in",
    headers: { "content-type": "application/json" },
    body: '{"id":"evt_1"}',
    signal: new AbortController().signal,
  };

  it("POSTs through the SSRF guard and treats 2xx as success", async () => {
    vi.mocked(withPublicHttpFetch).mockImplementation(async (_url, _init, handler) =>
      handler(new Response(null, { status: 204 })),
    );

    await expect(defaultWebhookSender(request)).resolves.toEqual({ ok: true, status: 204 });
    expect(withPublicHttpFetch).toHaveBeenCalledWith(
      request.url,
      expect.objectContaining({
        method: "POST",
        body: request.body,
        redirect: "manual",
        signal: request.signal,
      }),
      expect.any(Function),
      { maxResponseSize: 64 * 1024 },
    );
  });

  it("maps a non-2xx response to http_<status>", async () => {
    vi.mocked(withPublicHttpFetch).mockImplementation(async (_url, _init, handler) =>
      handler(new Response("nope", { status: 503 })),
    );

    await expect(defaultWebhookSender(request)).resolves.toEqual({
      ok: false,
      status: 503,
      error: "http_503",
    });
  });

  it("classifies an aborted send as timeout", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(withPublicHttpFetch).mockRejectedValue(new Error("aborted"));

    await expect(defaultWebhookSender({ ...request, signal: controller.signal })).resolves.toEqual({
      ok: false,
      status: null,
      error: "timeout",
    });
  });

  it("classifies SSRF and network failures", async () => {
    vi.mocked(withPublicHttpFetch).mockRejectedValueOnce(new Error("URL host is not allowed."));
    await expect(defaultWebhookSender(request)).resolves.toEqual({
      ok: false,
      status: null,
      error: "unsafe_url",
    });

    vi.mocked(withPublicHttpFetch).mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(defaultWebhookSender(request)).resolves.toEqual({
      ok: false,
      status: null,
      error: "network_error",
    });
  });
});
