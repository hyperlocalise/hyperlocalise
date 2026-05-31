import { describe, expect, it, vi } from "vite-plus/test";

import { createLokaliseWebhookSubscriptionAdapter } from "./lokalise-webhook-subscription-adapter";

describe("createLokaliseWebhookSubscriptionAdapter", () => {
  function createFetchMock(input: { status?: number } = {}) {
    return vi.fn(async (url, init) => {
      const target = String(url);

      if (input.status) {
        return new Response(JSON.stringify({ error: { message: "forbidden" } }), {
          status: input.status,
        });
      }

      if (target.includes("/webhooks") && (init?.method ?? "GET") === "GET") {
        return new Response(
          JSON.stringify({
            webhooks: [
              {
                webhook_id: "wh-1",
                url: "https://app.example.com/api/webhooks/tms/lokalise",
                secret: "remote-secret",
                events: ["project.key.added"],
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (target.includes("/webhooks") && init?.method === "POST") {
        const body =
          typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        return new Response(
          JSON.stringify({
            webhook: {
              webhook_id: "wh-created",
              url: body.url,
              secret: "provider-generated-secret",
              events: body.events,
            },
          }),
          { status: 200 },
        );
      }

      if (target.includes("/webhooks/wh-1") && init?.method === "PUT") {
        const body =
          typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        return new Response(
          JSON.stringify({
            webhook: {
              webhook_id: "wh-1",
              url: body.url,
              secret: "remote-secret",
              events: body.events,
            },
          }),
          { status: 200 },
        );
      }

      if (target.includes("/webhooks/") && init?.method === "DELETE") {
        return new Response(JSON.stringify({ webhook_deleted: true }), { status: 200 });
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });
  }

  const context = {
    organizationId: "org-1",
    providerCredentialId: "cred-1",
    providerKind: "lokalise" as const,
    projectId: "project-1",
    externalProjectId: "lokalise-project-1",
    secretMaterial: "api-token",
    baseUrl: null,
    region: null,
    endpointUrl: "https://app.example.com/api/webhooks/tms/lokalise",
    webhookSecret: "generated-secret",
    subscribedEvents: ["project.key.added", "project.task.created"],
  };

  it("creates remote webhooks and returns the provider-generated secret", async () => {
    const adapter = createLokaliseWebhookSubscriptionAdapter();
    const remote = await adapter.createRemoteSubscription({
      ...context,
      fetchFn: createFetchMock(),
    });

    expect(remote).toEqual({
      providerWebhookId: "wh-created",
      endpointUrl: context.endpointUrl,
      subscribedEvents: context.subscribedEvents,
      isActive: true,
      secret: "provider-generated-secret",
    });
  });

  it("maps permission errors to permission_denied", async () => {
    const adapter = createLokaliseWebhookSubscriptionAdapter();

    await expect(
      adapter.createRemoteSubscription({
        ...context,
        fetchFn: createFetchMock({ status: 403 }),
      }),
    ).rejects.toMatchObject({
      code: "permission_denied",
    });
  });

  it("requires a Lokalise project id for setup", async () => {
    const adapter = createLokaliseWebhookSubscriptionAdapter();

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
