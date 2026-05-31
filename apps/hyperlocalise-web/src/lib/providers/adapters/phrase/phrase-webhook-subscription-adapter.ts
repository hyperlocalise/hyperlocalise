import { PhraseApiClient, PhraseApiError } from "./phrase-api";
import {
  ProviderWebhookSubscriptionAdapterError,
  type ProviderWebhookRemoteSubscription,
  type ProviderWebhookSubscriptionAdapter,
  type ProviderWebhookSubscriptionAdapterContext,
} from "../../webhooks/provider-webhook-subscription-types";

const phraseWebhookDescription = "Hyperlocalise sync";
const providerWebhookIdQueryParam = "provider_webhook_id";

export function appendPhraseWebhookProviderId(endpointUrl: string, providerWebhookId: string) {
  const url = new URL(endpointUrl);
  url.searchParams.set(providerWebhookIdQueryParam, providerWebhookId);
  return url.toString();
}

function parsePhraseProjectId(externalProjectId: string | null) {
  if (!externalProjectId?.trim()) {
    throw new ProviderWebhookSubscriptionAdapterError(
      "invalid_configuration",
      "Phrase project id is required for webhook setup",
    );
  }

  return externalProjectId.trim();
}

function createPhraseClient(context: ProviderWebhookSubscriptionAdapterContext) {
  return new PhraseApiClient({
    token: context.secretMaterial,
    region: context.region,
    baseUrl: context.baseUrl ?? undefined,
    fetchFn: context.fetchFn,
  });
}

function mapPhraseWebhook(webhook: {
  id: string;
  callbackUrl: string;
  events: string[];
  active: boolean;
}): ProviderWebhookRemoteSubscription {
  return {
    providerWebhookId: webhook.id,
    endpointUrl: webhook.callbackUrl,
    subscribedEvents: webhook.events,
    isActive: webhook.active,
    secret: null,
  };
}

function buildCreateRequest(context: ProviderWebhookSubscriptionAdapterContext) {
  return {
    callbackUrl: context.endpointUrl,
    secret: context.webhookSecret,
    description: phraseWebhookDescription,
    events: context.subscribedEvents,
    active: true,
    includeBranches: false,
  };
}

function mapPhraseError(
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

  if (error instanceof PhraseApiError) {
    const code =
      error.status === 401 || error.status === 403 ? "permission_denied" : "provider_error";
    return new ProviderWebhookSubscriptionAdapterError(
      code,
      `Phrase webhook API returned HTTP ${error.status}`,
      {
        httpStatus: error.status,
        cause: error,
        providerWebhookId: options?.providerWebhookId,
      },
    );
  }

  return new ProviderWebhookSubscriptionAdapterError(
    "provider_error",
    error instanceof Error ? error.message : "Phrase webhook setup failed",
    { cause: error, providerWebhookId: options?.providerWebhookId },
  );
}

export function createPhraseWebhookSubscriptionAdapter(): ProviderWebhookSubscriptionAdapter {
  return {
    supportsAutomaticSetup: true,

    async listRemoteSubscriptions(context) {
      try {
        const projectId = parsePhraseProjectId(context.externalProjectId);
        const client = createPhraseClient(context);
        const webhooks = await client.listWebhooks(projectId);
        return webhooks.map(mapPhraseWebhook);
      } catch (error) {
        throw mapPhraseError(error);
      }
    },

    async createRemoteSubscription(context) {
      try {
        const projectId = parsePhraseProjectId(context.externalProjectId);
        const client = createPhraseClient(context);
        const created = await client.createWebhook(projectId, buildCreateRequest(context));
        const callbackUrl = appendPhraseWebhookProviderId(context.endpointUrl, created.id);
        const updated =
          callbackUrl === created.callbackUrl
            ? created
            : await client.updateWebhook(projectId, created.id, {
                ...buildCreateRequest(context),
                callbackUrl,
              });

        return {
          ...mapPhraseWebhook(updated),
          secret: context.webhookSecret,
        };
      } catch (error) {
        throw mapPhraseError(error);
      }
    },

    async updateRemoteSubscription(context) {
      try {
        const projectId = parsePhraseProjectId(context.externalProjectId);
        const webhookId = context.providerWebhookId.trim();
        if (!webhookId) {
          throw new ProviderWebhookSubscriptionAdapterError(
            "invalid_configuration",
            "Phrase webhook id is required for webhook updates",
          );
        }

        const client = createPhraseClient(context);
        const callbackUrl = appendPhraseWebhookProviderId(context.endpointUrl, webhookId);
        const updated = await client.updateWebhook(projectId, webhookId, {
          ...buildCreateRequest(context),
          callbackUrl,
        });

        return {
          ...mapPhraseWebhook(updated),
          secret: context.webhookSecret,
        };
      } catch (error) {
        throw mapPhraseError(error, { providerWebhookId: context.providerWebhookId });
      }
    },

    async disableRemoteSubscription(context) {
      try {
        const projectId = parsePhraseProjectId(context.externalProjectId);
        const webhookId = context.providerWebhookId.trim();
        if (!webhookId) {
          return;
        }

        const client = createPhraseClient(context);
        await client.updateWebhook(projectId, webhookId, {
          ...buildCreateRequest(context),
          callbackUrl: appendPhraseWebhookProviderId(context.endpointUrl, webhookId),
          active: false,
        });
      } catch (error) {
        throw mapPhraseError(error);
      }
    },

    async deleteRemoteSubscription(context) {
      try {
        const projectId = parsePhraseProjectId(context.externalProjectId);
        const webhookId = context.providerWebhookId.trim();
        if (!webhookId) {
          return;
        }

        const client = createPhraseClient(context);
        await client.deleteWebhook(projectId, webhookId);
      } catch (error) {
        throw mapPhraseError(error);
      }
    },
  };
}
