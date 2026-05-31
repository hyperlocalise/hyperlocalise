import {
  CrowdinApiClient,
  CrowdinApiError,
  type CrowdinPatchOperation,
  type CrowdinWebhook,
  type CrowdinWebhookEvent,
} from "./crowdin-api";
import {
  ProviderWebhookSubscriptionAdapterError,
  type ProviderWebhookRemoteSubscription,
  type ProviderWebhookSubscriptionAdapter,
  type ProviderWebhookSubscriptionAdapterContext,
} from "../../webhooks/provider-webhook-subscription-types";

const crowdinWebhookName = "Hyperlocalise sync";
const webhookIdHeaderName = "X-Hyperlocalise-Provider-Webhook-Id";
const webhookSecretHeaderName = "X-Hyperlocalise-Webhook-Secret";

function parseCrowdinProjectId(externalProjectId: string | null) {
  if (!externalProjectId) {
    throw new ProviderWebhookSubscriptionAdapterError(
      "invalid_configuration",
      "Crowdin project id is required for webhook setup",
    );
  }

  const projectId = Number(externalProjectId);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new ProviderWebhookSubscriptionAdapterError(
      "invalid_configuration",
      "Crowdin project id must be numeric for webhook setup",
    );
  }

  return projectId;
}

function createCrowdinClient(context: ProviderWebhookSubscriptionAdapterContext) {
  return new CrowdinApiClient({
    token: context.secretMaterial,
    baseUrl: context.baseUrl ?? undefined,
    fetchFn: context.fetchFn,
  });
}

function mapCrowdinWebhook(webhook: CrowdinWebhook): ProviderWebhookRemoteSubscription {
  return {
    providerWebhookId: String(webhook.id),
    endpointUrl: webhook.url,
    subscribedEvents: webhook.events,
    isActive: webhook.isActive,
    secret: webhook.headers?.[webhookSecretHeaderName] ?? null,
  };
}

function buildHeaders(input: { webhookSecret: string; providerWebhookId?: string }) {
  return {
    [webhookSecretHeaderName]: input.webhookSecret,
    ...(input.providerWebhookId ? { [webhookIdHeaderName]: input.providerWebhookId } : {}),
  };
}

function buildCreateRequest(context: ProviderWebhookSubscriptionAdapterContext) {
  return {
    name: crowdinWebhookName,
    url: context.endpointUrl,
    events: context.subscribedEvents as CrowdinWebhookEvent[],
    requestType: "POST" as const,
    contentType: "application/json" as const,
    isActive: true,
    batchingEnabled: false,
    headers: buildHeaders({ webhookSecret: context.webhookSecret }),
  };
}

function buildReplaceOperations(
  context: ProviderWebhookSubscriptionAdapterContext & { providerWebhookId: string },
): CrowdinPatchOperation[] {
  return [
    { op: "replace", path: "/name", value: crowdinWebhookName },
    { op: "replace", path: "/url", value: context.endpointUrl },
    { op: "replace", path: "/events", value: context.subscribedEvents },
    { op: "replace", path: "/requestType", value: "POST" },
    { op: "replace", path: "/contentType", value: "application/json" },
    { op: "replace", path: "/isActive", value: true },
    { op: "replace", path: "/batchingEnabled", value: false },
    {
      op: "replace",
      path: "/headers",
      value: buildHeaders({
        webhookSecret: context.webhookSecret,
        providerWebhookId: context.providerWebhookId,
      }),
    },
  ];
}

function mapCrowdinError(
  error: unknown,
  options?: { providerWebhookId?: string },
): ProviderWebhookSubscriptionAdapterError {
  if (error instanceof ProviderWebhookSubscriptionAdapterError) {
    if (options?.providerWebhookId && !error.providerWebhookId) {
      return new ProviderWebhookSubscriptionAdapterError(error.code, error.message, {
        httpStatus: error.httpStatus,
        cause: error.cause,
        providerWebhookId: options.providerWebhookId,
      });
    }

    return error;
  }

  if (error instanceof CrowdinApiError) {
    const code =
      error.status === 401 || error.status === 403 ? "permission_denied" : "provider_error";
    return new ProviderWebhookSubscriptionAdapterError(
      code,
      `Crowdin webhook API returned HTTP ${error.status}`,
      {
        httpStatus: error.status,
        cause: error,
        providerWebhookId: options?.providerWebhookId,
      },
    );
  }

  return new ProviderWebhookSubscriptionAdapterError(
    "provider_error",
    error instanceof Error ? error.message : "Crowdin webhook setup failed",
    { cause: error, providerWebhookId: options?.providerWebhookId },
  );
}

export function createCrowdinWebhookSubscriptionAdapter(): ProviderWebhookSubscriptionAdapter {
  return {
    supportsAutomaticSetup: true,

    async listRemoteSubscriptions(context) {
      try {
        const projectId = parseCrowdinProjectId(context.externalProjectId);
        const client = createCrowdinClient(context);
        const webhooks = await client.listWebhooks(projectId);
        return webhooks.map(mapCrowdinWebhook);
      } catch (error) {
        throw mapCrowdinError(error);
      }
    },

    async createRemoteSubscription(context) {
      const projectId = parseCrowdinProjectId(context.externalProjectId);
      const client = createCrowdinClient(context);

      let created: CrowdinWebhook;
      try {
        created = await client.createWebhook(projectId, buildCreateRequest(context));
      } catch (error) {
        throw mapCrowdinError(error);
      }

      const providerWebhookId = String(created.id);
      try {
        const updated = await client.updateWebhook(projectId, created.id, [
          {
            op: "replace",
            path: "/headers",
            value: buildHeaders({
              webhookSecret: context.webhookSecret,
              providerWebhookId,
            }),
          },
        ]);
        return mapCrowdinWebhook(updated);
      } catch (error) {
        throw mapCrowdinError(error, { providerWebhookId });
      }
    },

    async updateRemoteSubscription(context) {
      try {
        const projectId = parseCrowdinProjectId(context.externalProjectId);
        const webhookId = Number(context.providerWebhookId);
        if (!Number.isInteger(webhookId) || webhookId <= 0) {
          throw new ProviderWebhookSubscriptionAdapterError(
            "invalid_configuration",
            "Crowdin webhook id must be numeric",
          );
        }

        const client = createCrowdinClient(context);
        const updated = await client.updateWebhook(
          projectId,
          webhookId,
          buildReplaceOperations(context),
        );
        return mapCrowdinWebhook(updated);
      } catch (error) {
        throw mapCrowdinError(error);
      }
    },

    async disableRemoteSubscription(context) {
      try {
        const projectId = parseCrowdinProjectId(context.externalProjectId);
        const webhookId = Number(context.providerWebhookId);
        if (!Number.isInteger(webhookId) || webhookId <= 0) {
          return;
        }

        const client = createCrowdinClient(context);
        await client.updateWebhook(projectId, webhookId, [
          { op: "replace", path: "/isActive", value: false },
        ]);
      } catch (error) {
        throw mapCrowdinError(error);
      }
    },

    async deleteRemoteSubscription(context) {
      try {
        const projectId = parseCrowdinProjectId(context.externalProjectId);
        const webhookId = Number(context.providerWebhookId);
        if (!Number.isInteger(webhookId) || webhookId <= 0) {
          return;
        }

        const client = createCrowdinClient(context);
        await client.deleteWebhook(projectId, webhookId);
      } catch (error) {
        throw mapCrowdinError(error);
      }
    },
  };
}
