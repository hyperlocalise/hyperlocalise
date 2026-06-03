import { describe, expect, it, vi } from "vite-plus/test";

import {
  appendPhraseWebhookProviderId,
  createPhraseWebhookSubscriptionAdapter,
} from "./phrase-webhook-subscription-adapter";

describe("createPhraseWebhookSubscriptionAdapter", () => {
  function createFetchMock(input: { status?: number } = {}) {
    return vi.fn(async (url, init) => {
      const target = String(url);

      if (input.status) {
        return new Response(JSON.stringify({ message: "forbidden" }), {
          status: input.status,
        });
      }

      if (target.includes("/webhooks") && (init?.method ?? "GET") === "GET") {
        return new Response(
          JSON.stringify([
            {
              id: "wh-1",
              callback_url:
                "https://app.example.test/api/webhooks/tms/phrase?provider_webhook_id=wh-1",
              events: "keys:create,translations:update",
              active: true,
            },
          ]),
          { status: 200 },
        );
      }

      if (target.includes("/webhooks") && init?.method === "POST") {
        const body =
          typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        return new Response(
          JSON.stringify({
            id: "wh-created",
            callback_url: body.callback_url,
            events: body.events,
            active: true,
          }),
          { status: 201 },
        );
      }

      if (target.includes("/webhooks/wh-created") && init?.method === "PATCH") {
        const body =
          typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        return new Response(
          JSON.stringify({
            id: "wh-created",
            callback_url: body.callback_url,
            events: body.events,
            active: true,
          }),
          { status: 200 },
        );
      }

      if (target.includes("/webhooks/wh-1") && init?.method === "PATCH") {
        const body =
          typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        return new Response(
          JSON.stringify({
            id: "wh-1",
            callback_url: body.callback_url,
            events: body.events,
            active: body.active ?? true,
          }),
          { status: 200 },
        );
      }

      if (target.includes("/webhooks/") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });
  }

  const context = {
    organizationId: "org-1",
    providerCredentialId: "cred-1",
    providerKind: "phrase" as const,
    projectId: "project-1",
    externalProjectId: "phrase-project-1",
    secretMaterial: "api-token",
    baseUrl: null,
    region: null,
    endpointUrl: "https://app.example.test/api/webhooks/tms/phrase",
    webhookSecret: "generated-secret",
    subscribedEvents: ["keys:create", "uploads:create"],
  };

  it("appends provider_webhook_id to callback URLs", () => {
    expect(
      appendPhraseWebhookProviderId(
        "https://app.example.test/api/webhooks/tms/phrase",
        "wh-created",
      ),
    ).toBe("https://app.example.test/api/webhooks/tms/phrase?provider_webhook_id=wh-created");
  });

  it("preserves provider webhook id when callback URL patch fails", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const target = String(url);

      if (target.includes("/webhooks") && init?.method === "POST") {
        const body =
          typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        return new Response(
          JSON.stringify({
            id: "wh-created",
            callback_url: body.callback_url,
            events: body.events,
            active: true,
          }),
          { status: 201 },
        );
      }

      if (target.includes("/webhooks/wh-created") && init?.method === "PATCH") {
        return new Response(JSON.stringify({ message: "patch failed" }), { status: 500 });
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    const adapter = createPhraseWebhookSubscriptionAdapter();

    await expect(
      adapter.createRemoteSubscription({
        ...context,
        fetchFn: fetchMock,
      }),
    ).rejects.toMatchObject({
      code: "provider_error",
      providerWebhookId: "wh-created",
    });
  });

  it("creates remote webhooks and patches callback URL with provider id", async () => {
    const fetchMock = createFetchMock();
    const adapter = createPhraseWebhookSubscriptionAdapter();
    const remote = await adapter.createRemoteSubscription({
      ...context,
      fetchFn: fetchMock,
    });

    expect(remote).toMatchObject({
      providerWebhookId: "wh-created",
      endpointUrl:
        "https://app.example.test/api/webhooks/tms/phrase?provider_webhook_id=wh-created",
      subscribedEvents: context.subscribedEvents,
      isActive: true,
      secret: context.webhookSecret,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps permission errors to permission_denied", async () => {
    const adapter = createPhraseWebhookSubscriptionAdapter();

    await expect(
      adapter.createRemoteSubscription({
        ...context,
        fetchFn: createFetchMock({ status: 403 }),
      }),
    ).rejects.toMatchObject({
      code: "permission_denied",
    });
  });

  it("requires a Phrase project id for setup", async () => {
    const adapter = createPhraseWebhookSubscriptionAdapter();

    await expect(
      adapter.createRemoteSubscription({
        ...context,
        externalProjectId: null,
        fetchFn: createFetchMock(),
      }),
    ).rejects.toMatchObject({
      code: "invalid_configuration",
    });
  });
});
