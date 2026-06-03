import { parseSmartlingCredentials } from "./smartling-credentials";
import {
  SmartlingApiClient,
  SmartlingApiError,
  type SmartlingWebhookEventSpec,
  type SmartlingWebhookSubscription,
} from "./smartling-api";
import { resolveSmartlingAccountUid } from "./smartling-account-context";
import {
  ProviderWebhookSubscriptionAdapterError,
  type ProviderWebhookRemoteSubscription,
  type ProviderWebhookSubscriptionAdapter,
  type ProviderWebhookSubscriptionAdapterContext,
} from "../../webhooks/provider-webhook-subscription-types";

const smartlingWebhookName = "Hyperlocalise sync";
const webhookIdHeaderName = "X-Hyperlocalise-Provider-Webhook-Id";
const webhookSecretHeaderName = "X-Hyperlocalise-Webhook-Secret";
const defaultSchemaVersion = "1.0";
const maxProjectUidsPerSubscription = 10;

function createSmartlingClient(context: ProviderWebhookSubscriptionAdapterContext) {
  return new SmartlingApiClient({
    credentials: context.secretMaterial,
    authBaseUrl: context.baseUrl ?? undefined,
    fetchFn: context.fetchFn,
  });
}

function toSmartlingEvents(subscribedEvents: string[]): SmartlingWebhookEventSpec[] {
  return subscribedEvents.map((type) => ({
    type,
    schemaVersion: defaultSchemaVersion,
  }));
}

function fromSmartlingEvents(events: SmartlingWebhookEventSpec[]) {
  return events.map((event) => event.type);
}

function buildRequestHeaders(input: { webhookSecret: string; providerWebhookId?: string }) {
  return [
    {
      headerName: webhookSecretHeaderName,
      headerValue: input.webhookSecret,
    },
    ...(input.providerWebhookId
      ? [
          {
            headerName: webhookIdHeaderName,
            headerValue: input.providerWebhookId,
          },
        ]
      : []),
  ];
}

function mapSmartlingWebhook(
  subscription: SmartlingWebhookSubscription,
): ProviderWebhookRemoteSubscription {
  return {
    providerWebhookId: subscription.subscriptionUid,
    endpointUrl: subscription.subscriptionUrl,
    subscribedEvents: fromSmartlingEvents(subscription.events),
    isActive: subscription.isActive ?? true,
    secret: subscription.payloadSecret ?? null,
  };
}

async function resolveAccountUid(context: ProviderWebhookSubscriptionAdapterContext) {
  const credentials = parseSmartlingCredentials(context.secretMaterial);
  if (credentials.accountUid?.trim()) {
    return credentials.accountUid.trim();
  }

  const projectId = context.externalProjectId?.trim() || credentials.projectId?.trim();
  if (!projectId) {
    throw new ProviderWebhookSubscriptionAdapterError(
      "invalid_configuration",
      "Smartling account UID or project id is required for webhook setup",
    );
  }

  const accountUid = await resolveSmartlingAccountUid({
    secretMaterial: context.secretMaterial,
    externalProjectId: projectId,
    authBaseUrl: context.baseUrl ?? undefined,
  });

  if (!accountUid) {
    throw new ProviderWebhookSubscriptionAdapterError(
      "invalid_configuration",
      "Unable to resolve Smartling account UID for webhook setup",
    );
  }

  return accountUid;
}

function resolveProjectUids(context: ProviderWebhookSubscriptionAdapterContext) {
  const credentials = parseSmartlingCredentials(context.secretMaterial);
  const projectId = context.externalProjectId?.trim() || credentials.projectId?.trim();

  if (!projectId) {
    throw new ProviderWebhookSubscriptionAdapterError(
      "invalid_configuration",
      "Smartling project id is required for webhook setup",
    );
  }

  return [projectId];
}

function buildSubscriptionRequest(
  context: ProviderWebhookSubscriptionAdapterContext & { providerWebhookId?: string },
) {
  const projectUids = resolveProjectUids(context);
  if (projectUids.length > maxProjectUidsPerSubscription) {
    throw new ProviderWebhookSubscriptionAdapterError(
      "not_supported",
      `Smartling allows at most ${maxProjectUidsPerSubscription} projects per webhook subscription`,
    );
  }

  return {
    subscriptionName: smartlingWebhookName,
    subscriptionUrl: context.endpointUrl,
    description: "Hyperlocalise TMS reconciliation webhook",
    payloadSecret: context.webhookSecret,
    requestHeaders: buildRequestHeaders({
      webhookSecret: context.webhookSecret,
      providerWebhookId: context.providerWebhookId,
    }),
    events: toSmartlingEvents(context.subscribedEvents),
    projectUids,
  };
}

function mapSmartlingError(
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

  if (error instanceof SmartlingApiError) {
    const combinedMessage =
      `${error.message} ${collectSmartlingWebhookErrorDetail(error)}`.toLowerCase();

    if (error.status === 401 || error.status === 403) {
      return new ProviderWebhookSubscriptionAdapterError(
        "permission_denied",
        `Smartling webhook API returned HTTP ${error.status}`,
        {
          httpStatus: error.status,
          cause: error,
          providerWebhookId: options?.providerWebhookId,
        },
      );
    }

    if (
      combinedMessage.includes("limit") ||
      combinedMessage.includes("maximum") ||
      combinedMessage.includes("too many")
    ) {
      return new ProviderWebhookSubscriptionAdapterError(
        "not_supported",
        "Smartling webhook subscription limit reached. Configure the webhook manually in Smartling.",
        {
          httpStatus: error.status,
          cause: error,
          providerWebhookId: options?.providerWebhookId,
        },
      );
    }

    return new ProviderWebhookSubscriptionAdapterError(
      "provider_error",
      `Smartling webhook API returned HTTP ${error.status}`,
      {
        httpStatus: error.status,
        cause: error,
        providerWebhookId: options?.providerWebhookId,
      },
    );
  }

  return new ProviderWebhookSubscriptionAdapterError(
    "provider_error",
    error instanceof Error ? error.message : "Smartling webhook setup failed",
    { cause: error, providerWebhookId: options?.providerWebhookId },
  );
}

function collectSmartlingWebhookErrorDetail(error: SmartlingApiError) {
  if (!error.responseBody || typeof error.responseBody !== "object") {
    return "";
  }

  const response = (error.responseBody as { response?: { errors?: Array<{ message?: string }> } })
    .response;
  const errors = Array.isArray(response?.errors) ? response.errors : [];
  return errors
    .map((entry) => (typeof entry?.message === "string" ? entry.message : ""))
    .filter(Boolean)
    .join(" ");
}

export function createSmartlingWebhookSubscriptionAdapter(): ProviderWebhookSubscriptionAdapter {
  return {
    supportsAutomaticSetup: true,

    async listRemoteSubscriptions(context) {
      try {
        const accountUid = await resolveAccountUid(context);
        const client = createSmartlingClient(context);
        const subscriptions = await client.listWebhookSubscriptions(accountUid);
        return subscriptions.map(mapSmartlingWebhook);
      } catch (error) {
        throw mapSmartlingError(error);
      }
    },

    async createRemoteSubscription(context) {
      let providerWebhookId: string | undefined;

      try {
        const accountUid = await resolveAccountUid(context);
        const client = createSmartlingClient(context);
        const created = await client.createWebhookSubscription(
          accountUid,
          buildSubscriptionRequest(context),
        );
        providerWebhookId = created.subscriptionUid;
        const updated = await client.updateWebhookSubscription(
          accountUid,
          providerWebhookId,
          buildSubscriptionRequest({ ...context, providerWebhookId }),
        );
        return mapSmartlingWebhook(updated);
      } catch (error) {
        throw mapSmartlingError(error, providerWebhookId ? { providerWebhookId } : undefined);
      }
    },

    async updateRemoteSubscription(context) {
      try {
        const accountUid = await resolveAccountUid(context);
        const client = createSmartlingClient(context);
        const updated = await client.updateWebhookSubscription(
          accountUid,
          context.providerWebhookId,
          buildSubscriptionRequest({ ...context, providerWebhookId: context.providerWebhookId }),
        );
        return mapSmartlingWebhook(updated);
      } catch (error) {
        throw mapSmartlingError(error, { providerWebhookId: context.providerWebhookId });
      }
    },

    async disableRemoteSubscription(context) {
      try {
        const accountUid = await resolveAccountUid(context);
        const client = createSmartlingClient(context);
        await client.disableWebhookSubscription(accountUid, context.providerWebhookId);
      } catch (error) {
        throw mapSmartlingError(error, { providerWebhookId: context.providerWebhookId });
      }
    },

    async deleteRemoteSubscription(context) {
      try {
        const accountUid = await resolveAccountUid(context);
        const client = createSmartlingClient(context);
        await client.deleteWebhookSubscription(accountUid, context.providerWebhookId);
      } catch (error) {
        throw mapSmartlingError(error, { providerWebhookId: context.providerWebhookId });
      }
    },
  };
}
