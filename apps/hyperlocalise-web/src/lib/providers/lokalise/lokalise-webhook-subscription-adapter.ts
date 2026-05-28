import { LokaliseApiClient, LokaliseApiError, type LokaliseWebhookEvent } from "./lokalise-api";
import {
  ProviderWebhookSubscriptionAdapterError,
  type ProviderWebhookRemoteSubscription,
  type ProviderWebhookSubscriptionAdapter,
  type ProviderWebhookSubscriptionAdapterContext,
} from "../provider-webhook-subscription-types";

function parseLokaliseProjectId(externalProjectId: string | null) {
  if (!externalProjectId?.trim()) {
    throw new ProviderWebhookSubscriptionAdapterError(
      "invalid_configuration",
      "Lokalise project id is required for webhook setup",
    );
  }

  return externalProjectId.trim();
}

function createLokaliseClient(context: ProviderWebhookSubscriptionAdapterContext) {
  return new LokaliseApiClient({
    token: context.secretMaterial,
    baseUrl: context.baseUrl ?? undefined,
    fetchFn: context.fetchFn,
  });
}

function mapLokaliseWebhook(webhook: {
  webhookId: string;
  url: string;
  events: string[];
  secret: string;
}): ProviderWebhookRemoteSubscription {
  return {
    providerWebhookId: webhook.webhookId,
    endpointUrl: webhook.url,
    subscribedEvents: webhook.events,
    isActive: true,
    secret: webhook.secret,
  };
}

function buildCreateRequest(context: ProviderWebhookSubscriptionAdapterContext) {
  return {
    url: context.endpointUrl,
    events: context.subscribedEvents as LokaliseWebhookEvent[],
  };
}

function mapLokaliseError(
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

  if (error instanceof LokaliseApiError) {
    const code =
      error.status === 401 || error.status === 403 ? "permission_denied" : "provider_error";
    return new ProviderWebhookSubscriptionAdapterError(
      code,
      `Lokalise webhook API returned HTTP ${error.status}`,
      {
        httpStatus: error.status,
        cause: error,
        providerWebhookId: options?.providerWebhookId,
      },
    );
  }

  return new ProviderWebhookSubscriptionAdapterError(
    "provider_error",
    error instanceof Error ? error.message : "Lokalise webhook setup failed",
    { cause: error, providerWebhookId: options?.providerWebhookId },
  );
}

export function createLokaliseWebhookSubscriptionAdapter(): ProviderWebhookSubscriptionAdapter {
  return {
    supportsAutomaticSetup: true,

    async listRemoteSubscriptions(context) {
      try {
        const projectId = parseLokaliseProjectId(context.externalProjectId);
        const client = createLokaliseClient(context);
        const webhooks = await client.listWebhooks(projectId);
        return webhooks.map(mapLokaliseWebhook);
      } catch (error) {
        throw mapLokaliseError(error);
      }
    },

    async createRemoteSubscription(context) {
      const projectId = parseLokaliseProjectId(context.externalProjectId);
      const client = createLokaliseClient(context);

      try {
        const created = await client.createWebhook(projectId, buildCreateRequest(context));
        return mapLokaliseWebhook(created);
      } catch (error) {
        throw mapLokaliseError(error);
      }
    },

    async updateRemoteSubscription(context) {
      try {
        const projectId = parseLokaliseProjectId(context.externalProjectId);
        const webhookId = context.providerWebhookId.trim();
        if (!webhookId) {
          throw new ProviderWebhookSubscriptionAdapterError(
            "invalid_configuration",
            "Lokalise webhook id is required for webhook updates",
          );
        }

        const client = createLokaliseClient(context);
        const updated = await client.updateWebhook(
          projectId,
          webhookId,
          buildCreateRequest(context),
        );
        return mapLokaliseWebhook(updated);
      } catch (error) {
        throw mapLokaliseError(error, { providerWebhookId: context.providerWebhookId });
      }
    },

    async disableRemoteSubscription(context) {
      try {
        const projectId = parseLokaliseProjectId(context.externalProjectId);
        const webhookId = context.providerWebhookId.trim();
        if (!webhookId) {
          return;
        }

        const client = createLokaliseClient(context);
        await client.deleteWebhook(projectId, webhookId);
      } catch (error) {
        throw mapLokaliseError(error);
      }
    },

    async deleteRemoteSubscription(context) {
      try {
        const projectId = parseLokaliseProjectId(context.externalProjectId);
        const webhookId = context.providerWebhookId.trim();
        if (!webhookId) {
          return;
        }

        const client = createLokaliseClient(context);
        await client.deleteWebhook(projectId, webhookId);
      } catch (error) {
        throw mapLokaliseError(error);
      }
    },
  };
}
