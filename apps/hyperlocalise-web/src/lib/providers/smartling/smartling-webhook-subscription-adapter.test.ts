import { describe, expect, it, vi } from "vite-plus/test";

import { createSmartlingWebhookSubscriptionAdapter } from "./smartling-webhook-subscription-adapter";

describe("createSmartlingWebhookSubscriptionAdapter", () => {
  function createFetchMock(input: { updateFails?: boolean; status?: number } = {}) {
    return vi.fn(async (url, init) => {
      const target = String(url);

      if (input.status) {
        return new Response(
          JSON.stringify({
            response: {
              code: "VALIDATION_ERROR",
              errors: [{ message: "subscription limit reached" }],
            },
          }),
          { status: input.status },
        );
      }

      if (target.endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (target.includes("/subscriptions") && (init?.method ?? "GET") === "GET") {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { items: [], totalCount: 0 },
            },
          }),
          { status: 200 },
        );
      }

      if (
        target.includes("/subscriptions") &&
        init?.method === "POST" &&
        !target.endsWith("/disable")
      ) {
        const body =
          typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                subscriptionUid: "sub-smartling-1",
                subscriptionName: body.subscriptionName,
                subscriptionUrl: body.subscriptionUrl,
                payloadSecret: body.payloadSecret,
                requestHeaders: body.requestHeaders ?? [],
                events: body.events ?? [],
                projectUids: body.projectUids ?? [],
                isActive: true,
              },
            },
          }),
          { status: 200 },
        );
      }

      if (target.includes("/subscriptions/sub-smartling-1") && init?.method === "PUT") {
        if (input.updateFails) {
          return new Response(
            JSON.stringify({
              response: {
                code: "ERROR",
                errors: [{ message: "update failed" }],
              },
            }),
            { status: 500 },
          );
        }

        const body =
          typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                subscriptionUid: "sub-smartling-1",
                subscriptionName: body.subscriptionName,
                subscriptionUrl: body.subscriptionUrl,
                payloadSecret: body.payloadSecret,
                requestHeaders: body.requestHeaders ?? [],
                events: body.events ?? [],
                projectUids: body.projectUids ?? [],
                isActive: true,
              },
            },
          }),
          { status: 200 },
        );
      }

      if (target.endsWith("/disable") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            response: { code: "SUCCESS", data: {} },
          }),
          { status: 200 },
        );
      }

      if (target.includes("/subscriptions/sub-smartling-1") && init?.method === "DELETE") {
        return new Response(
          JSON.stringify({
            response: { code: "SUCCESS", data: {} },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;
  }

  const baseContext = {
    organizationId: "org-1",
    providerCredentialId: "cred-1",
    providerKind: "smartling" as const,
    projectId: "project-1",
    externalProjectId: "smartling-project-1",
    secretMaterial: "user-1:secret-1:acct-smartling-1",
    baseUrl: null,
    region: null,
    endpointUrl: "https://app.example.test/api/webhooks/tms/smartling",
    webhookSecret: "webhook-signing-secret",
    subscribedEvents: ["file.published", "job.completed"],
  };

  it("creates a remote subscription and patches provider webhook headers", async () => {
    const adapter = createSmartlingWebhookSubscriptionAdapter();
    const fetchFn = createFetchMock();

    const remote = await adapter.createRemoteSubscription({
      ...baseContext,
      fetchFn,
    });

    expect(remote).toMatchObject({
      providerWebhookId: "sub-smartling-1",
      endpointUrl: baseContext.endpointUrl,
      subscribedEvents: ["file.published", "job.completed"],
      isActive: true,
    });

    const fetchMock = vi.mocked(fetchFn);
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(putCall).toBeDefined();
    const putInit = putCall?.[1];
    const putBody = JSON.parse(
      typeof putInit?.body === "string" ? putInit.body : "{}",
    ) as {
      requestHeaders: Array<{ headerName: string; headerValue: string }>;
    };
    expect(putBody.requestHeaders).toEqual(
      expect.arrayContaining([
        {
          headerName: "X-Hyperlocalise-Webhook-Secret",
          headerValue: "webhook-signing-secret",
        },
        {
          headerName: "X-Hyperlocalise-Provider-Webhook-Id",
          headerValue: "sub-smartling-1",
        },
      ]),
    );
  });

  it("maps subscription limit failures to not_supported", async () => {
    const adapter = createSmartlingWebhookSubscriptionAdapter();

    await expect(
      adapter.createRemoteSubscription({
        ...baseContext,
        fetchFn: createFetchMock({ status: 400 }),
      }),
    ).rejects.toMatchObject({
      code: "not_supported",
    });
  });

  it("returns provider webhook id when header activation fails after create", async () => {
    const adapter = createSmartlingWebhookSubscriptionAdapter();

    await expect(
      adapter.createRemoteSubscription({
        ...baseContext,
        fetchFn: createFetchMock({ updateFails: true }),
      }),
    ).rejects.toMatchObject({
      code: "provider_error",
      providerWebhookId: "sub-smartling-1",
    });
  });
});
