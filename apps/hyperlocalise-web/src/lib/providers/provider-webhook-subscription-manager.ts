import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ProviderWebhookSubscription } from "@/lib/database/types";
import {
  decryptProviderCredential,
  maskProviderCredentialSuffix,
} from "@/lib/security/provider-credential-crypto";
import { providerSupportsTmsAction } from "@/lib/providers/tms-capabilities";

import { listDefaultWebhookEvents } from "./provider-webhook-default-events";
import {
  buildTmsWebhookEndpointUrl,
  isAutomaticWebhookSetupEnabled,
} from "./provider-webhook-public-url";
import { getProviderWebhookSubscriptionAdapter } from "./provider-webhook-subscription-adapters";
import {
  ProviderWebhookSubscriptionAdapterError,
  type ProviderWebhookManualFallback,
  type ProviderWebhookSubscriptionAuditResult,
  type ProviderWebhookSubscriptionSetupResult,
  type ProviderWebhookSubscriptionSummary,
} from "./provider-webhook-subscription-types";
import {
  findProviderWebhookSubscriptionByCredentialProject,
  insertProviderWebhookSubscription,
  listProviderWebhookSubscriptionsForAudit,
  listProviderWebhookSubscriptionsForCredential,
  updateProviderWebhookSubscription,
} from "./provider-webhook-storage";
import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

function subscribedEventsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.every((event) => rightSet.has(event));
}

function summarizeSubscription(
  subscription: ProviderWebhookSubscription,
): ProviderWebhookSubscriptionSummary {
  const manualFallback =
    subscription.manualFallback &&
    Object.keys(subscription.manualFallback).length > 0 &&
    subscription.manualFallback.webhookUrl
      ? (subscription.manualFallback as ProviderWebhookManualFallback)
      : null;

  return {
    id: subscription.id,
    organizationId: subscription.organizationId,
    providerCredentialId: subscription.providerCredentialId,
    projectId: subscription.projectId,
    providerKind: subscription.providerKind as ExternalTmsProviderKind,
    providerWebhookId: subscription.providerWebhookId,
    endpointUrl: subscription.endpointUrl,
    subscribedEvents: subscription.subscribedEvents,
    status: subscription.status,
    manualFallback,
    lastError: subscription.lastError,
    lastErrorAt: subscription.lastErrorAt?.toISOString() ?? null,
    lastAuditedAt: subscription.lastAuditedAt?.toISOString() ?? null,
    updatedAt: subscription.updatedAt.toISOString(),
    canRetry: ["permission_error", "provider_error", "manual_required", "disabled"].includes(
      subscription.status,
    ),
  };
}

function buildManualFallback(input: {
  providerKind: ExternalTmsProviderKind;
  endpointUrl: string;
  subscribedEvents: string[];
  lastError?: string;
}): ProviderWebhookManualFallback {
  return {
    webhookUrl: input.endpointUrl,
    secretHeaderName: "X-Hyperlocalise-Signature-256",
    secretInstructions:
      "Send the signing secret using the X-Hyperlocalise-Signature-256 header (sha256 HMAC of the raw request body). Also set X-Provider-Webhook-Id to the provider webhook identifier.",
    subscribedEvents: input.subscribedEvents,
    ...(input.lastError ? { lastError: input.lastError } : {}),
  };
}

function generateWebhookSecret() {
  return randomBytes(32).toString("hex");
}

const emptyManualFallback = {} as ProviderWebhookSubscription["manualFallback"];

async function loadCredentialContext(input: {
  organizationId: string;
  providerCredentialId: string;
}) {
  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.id, input.providerCredentialId),
      ),
    )
    .limit(1);

  if (!credential) {
    return null;
  }

  return {
    credential,
    secretMaterial: decryptProviderCredential({
      algorithm: credential.encryptionAlgorithm,
      keyVersion: credential.keyVersion,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    }),
  };
}

async function resolveProjectExternalId(projectId: string | null) {
  if (!projectId) {
    return null;
  }

  const [project] = await db
    .select({
      externalProjectId: schema.projects.externalProjectId,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  return project?.externalProjectId ?? null;
}

export async function listProviderWebhookSubscriptionSummaries(input: {
  organizationId: string;
  providerCredentialId: string;
}) {
  const subscriptions = await listProviderWebhookSubscriptionsForCredential(input);
  return subscriptions.map(summarizeSubscription);
}

export async function ensureProviderWebhookSubscription(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string;
  projectId?: string | null;
  externalProjectId?: string | null;
  fetchFn?: typeof fetch;
}): Promise<ProviderWebhookSubscriptionSetupResult> {
  const endpointUrl = buildTmsWebhookEndpointUrl(input.providerKind);
  const subscribedEvents = listDefaultWebhookEvents(input.providerKind);
  const projectId = input.projectId ?? null;
  const externalProjectId =
    input.externalProjectId ?? (projectId ? await resolveProjectExternalId(projectId) : null);

  const existing = await findProviderWebhookSubscriptionByCredentialProject({
    organizationId: input.organizationId,
    providerCredentialId: input.providerCredentialId,
    projectId,
  });

  const placeholderWebhookId =
    existing?.providerWebhookId ?? `pending-${randomBytes(8).toString("hex")}`;

  let subscription =
    existing ??
    (await insertProviderWebhookSubscription({
      organizationId: input.organizationId,
      providerCredentialId: input.providerCredentialId,
      providerKind: input.providerKind,
      providerWebhookId: placeholderWebhookId,
      endpointUrl: endpointUrl ?? "",
      projectId,
      subscribedEvents,
      status: "pending",
    }));

  if (!endpointUrl) {
    const manualFallback = buildManualFallback({
      providerKind: input.providerKind,
      endpointUrl: subscription.endpointUrl || "(configure HYPERLOCALISE_PUBLIC_APP_URL)",
      subscribedEvents,
      lastError: "Public app URL is not configured for automatic webhook setup",
    });

    subscription = await updateProviderWebhookSubscription({
      subscriptionId: subscription.id,
      organizationId: input.organizationId,
      status: "manual_required",
      manualFallback,
      lastError: manualFallback.lastError ?? null,
      subscribedEvents,
    });

    return {
      subscription: summarizeSubscription(subscription),
      status: subscription.status,
    };
  }

  const adapter = getProviderWebhookSubscriptionAdapter(input.providerKind);
  const canConfigure = providerSupportsTmsAction(input.providerKind, "webhooks.configure");

  if (!isAutomaticWebhookSetupEnabled() || !adapter.supportsAutomaticSetup || !canConfigure) {
    const manualFallback = buildManualFallback({
      providerKind: input.providerKind,
      endpointUrl,
      subscribedEvents,
      lastError: !canConfigure
        ? "This provider connector does not support automatic webhook configuration"
        : "Automatic webhook setup is unavailable for this deployment",
    });

    subscription = await updateProviderWebhookSubscription({
      subscriptionId: subscription.id,
      organizationId: input.organizationId,
      status: "manual_required",
      endpointUrl,
      manualFallback,
      lastError: manualFallback.lastError ?? null,
      subscribedEvents,
    });

    return {
      subscription: summarizeSubscription(subscription),
      status: subscription.status,
    };
  }

  const credentialContext = await loadCredentialContext({
    organizationId: input.organizationId,
    providerCredentialId: input.providerCredentialId,
  });

  if (!credentialContext) {
    throw new Error("provider_credential_not_found");
  }

  if (
    existing?.status === "active" &&
    existing.endpointUrl === endpointUrl &&
    subscribedEventsEqual(existing.subscribedEvents, subscribedEvents)
  ) {
    return {
      subscription: summarizeSubscription(existing),
      status: existing.status,
    };
  }

  const webhookSecret = generateWebhookSecret();

  subscription = await updateProviderWebhookSubscription({
    subscriptionId: subscription.id,
    organizationId: input.organizationId,
    status: "pending",
    endpointUrl,
    subscribedEvents,
    manualFallback: emptyManualFallback,
    lastError: null,
  });

  try {
    const adapterContext = {
      organizationId: input.organizationId,
      providerCredentialId: input.providerCredentialId,
      providerKind: input.providerKind,
      projectId,
      externalProjectId,
      secretMaterial: credentialContext.secretMaterial,
      baseUrl: credentialContext.credential.baseUrl,
      region: credentialContext.credential.region,
      endpointUrl,
      webhookSecret,
      subscribedEvents,
      fetchFn: input.fetchFn,
    };

    const remote =
      existing && existing.status === "active"
        ? await adapter.updateRemoteSubscription({
            ...adapterContext,
            providerWebhookId: existing.providerWebhookId,
          })
        : await adapter.createRemoteSubscription(adapterContext);

    subscription = await updateProviderWebhookSubscription({
      subscriptionId: subscription.id,
      organizationId: input.organizationId,
      status: "active",
      providerWebhookId: remote.providerWebhookId,
      endpointUrl: remote.endpointUrl,
      subscribedEvents: remote.subscribedEvents,
      manualFallback: emptyManualFallback,
      lastError: null,
      webhookSecretPlaintext: webhookSecret,
      secretMetadata: {
        maskedSecretSuffix: maskProviderCredentialSuffix(webhookSecret),
      },
    });
  } catch (error) {
    const message =
      error instanceof ProviderWebhookSubscriptionAdapterError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Provider webhook setup failed";

    const status =
      error instanceof ProviderWebhookSubscriptionAdapterError && error.code === "permission_denied"
        ? "permission_error"
        : error instanceof ProviderWebhookSubscriptionAdapterError && error.code === "not_supported"
          ? "manual_required"
          : "provider_error";

    const manualFallback = buildManualFallback({
      providerKind: input.providerKind,
      endpointUrl,
      subscribedEvents,
      lastError: message,
    });

    subscription = await updateProviderWebhookSubscription({
      subscriptionId: subscription.id,
      organizationId: input.organizationId,
      status,
      manualFallback,
      lastError: message,
      subscribedEvents,
      webhookSecretPlaintext: webhookSecret,
      secretMetadata: {
        maskedSecretSuffix: maskProviderCredentialSuffix(webhookSecret),
      },
    });
  }

  return {
    subscription: summarizeSubscription(subscription),
    status: subscription.status,
  };
}

export async function retryProviderWebhookSubscriptionSetup(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string;
  projectId?: string | null;
  fetchFn?: typeof fetch;
}) {
  return ensureProviderWebhookSubscription(input);
}

export async function disableProviderWebhookSubscription(input: {
  organizationId: string;
  subscriptionId: string;
  fetchFn?: typeof fetch;
}) {
  const [subscription] = await db
    .select()
    .from(schema.providerWebhookSubscriptions)
    .where(
      and(
        eq(schema.providerWebhookSubscriptions.id, input.subscriptionId),
        eq(schema.providerWebhookSubscriptions.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!subscription) {
    throw new Error("Provider webhook subscription not found");
  }

  const providerKind = subscription.providerKind as ExternalTmsProviderKind;
  const adapter = getProviderWebhookSubscriptionAdapter(providerKind);

  if (
    subscription.status === "active" &&
    adapter.supportsAutomaticSetup &&
    subscription.providerWebhookId &&
    !subscription.providerWebhookId.startsWith("pending-")
  ) {
    const credentialContext = await loadCredentialContext({
      organizationId: input.organizationId,
      providerCredentialId: subscription.providerCredentialId,
    });

    if (credentialContext) {
      try {
        await adapter.disableRemoteSubscription({
          organizationId: input.organizationId,
          providerCredentialId: subscription.providerCredentialId,
          providerKind,
          projectId: subscription.projectId,
          externalProjectId: subscription.projectId
            ? await resolveProjectExternalId(subscription.projectId)
            : null,
          secretMaterial: credentialContext.secretMaterial,
          baseUrl: credentialContext.credential.baseUrl,
          region: credentialContext.credential.region,
          endpointUrl: subscription.endpointUrl,
          webhookSecret: "",
          subscribedEvents: subscription.subscribedEvents,
          providerWebhookId: subscription.providerWebhookId,
          fetchFn: input.fetchFn,
        });
      } catch {
        // Best-effort disable at provider; local status still moves to disabled.
      }
    }
  }

  const updated = await updateProviderWebhookSubscription({
    subscriptionId: subscription.id,
    organizationId: input.organizationId,
    status: "disabled",
  });

  return summarizeSubscription(updated);
}

export async function auditProviderWebhookSubscriptions(input: {
  organizationId?: string;
  fetchFn?: typeof fetch;
}): Promise<ProviderWebhookSubscriptionAuditResult[]> {
  const subscriptions = await listProviderWebhookSubscriptionsForAudit({
    organizationId: input.organizationId,
    statuses: ["active", "provider_error", "permission_error"],
  });

  const results: ProviderWebhookSubscriptionAuditResult[] = [];

  for (const subscription of subscriptions) {
    const providerKind = subscription.providerKind as ExternalTmsProviderKind;
    const adapter = getProviderWebhookSubscriptionAdapter(providerKind);

    if (
      !adapter.supportsAutomaticSetup ||
      !subscription.providerWebhookId ||
      subscription.providerWebhookId.startsWith("pending-")
    ) {
      results.push({
        subscriptionId: subscription.id,
        action: "unchanged",
        status: subscription.status,
      });
      continue;
    }

    const credential = await db
      .select()
      .from(schema.organizationExternalTmsProviderCredentials)
      .where(
        eq(schema.organizationExternalTmsProviderCredentials.id, subscription.providerCredentialId),
      )
      .limit(1);

    const credentialRow = credential[0];
    if (!credentialRow) {
      const updated = await updateProviderWebhookSubscription({
        subscriptionId: subscription.id,
        organizationId: subscription.organizationId,
        status: "disabled",
        lastAuditedAt: new Date(),
        lastError: "Provider credential no longer exists",
      });
      results.push({
        subscriptionId: subscription.id,
        action: "disabled",
        status: updated.status,
      });
      continue;
    }

    const secretMaterial = decryptProviderCredential({
      algorithm: credentialRow.encryptionAlgorithm,
      keyVersion: credentialRow.keyVersion,
      ciphertext: credentialRow.ciphertext,
      iv: credentialRow.iv,
      authTag: credentialRow.authTag,
    });

    let remoteWebhooks: Awaited<ReturnType<typeof adapter.listRemoteSubscriptions>> = [];

    try {
      remoteWebhooks = await adapter.listRemoteSubscriptions({
        organizationId: subscription.organizationId,
        providerCredentialId: subscription.providerCredentialId,
        providerKind,
        projectId: subscription.projectId,
        externalProjectId: subscription.projectId
          ? await resolveProjectExternalId(subscription.projectId)
          : null,
        secretMaterial,
        baseUrl: credentialRow.baseUrl,
        region: credentialRow.region,
        endpointUrl: subscription.endpointUrl,
        webhookSecret: "",
        subscribedEvents: subscription.subscribedEvents,
        fetchFn: input.fetchFn,
      });
    } catch {
      await updateProviderWebhookSubscription({
        subscriptionId: subscription.id,
        organizationId: subscription.organizationId,
        lastAuditedAt: new Date(),
        lastError: "Webhook audit could not reach provider API",
      });
      results.push({
        subscriptionId: subscription.id,
        action: "unchanged",
        status: subscription.status,
      });
      continue;
    }

    const remote = remoteWebhooks.find(
      (item) => item.providerWebhookId === subscription.providerWebhookId,
    );

    if (!remote) {
      const updated = await updateProviderWebhookSubscription({
        subscriptionId: subscription.id,
        organizationId: subscription.organizationId,
        status: "provider_error",
        lastAuditedAt: new Date(),
        lastError: "Provider webhook no longer exists remotely",
      });
      results.push({
        subscriptionId: subscription.id,
        action: "marked_stale",
        status: updated.status,
      });
      continue;
    }

    if (!remote.isActive || remote.endpointUrl !== subscription.endpointUrl) {
      try {
        await adapter.updateRemoteSubscription({
          organizationId: subscription.organizationId,
          providerCredentialId: subscription.providerCredentialId,
          providerKind,
          projectId: subscription.projectId,
          externalProjectId: subscription.projectId
            ? await resolveProjectExternalId(subscription.projectId)
            : null,
          secretMaterial,
          baseUrl: credentialRow.baseUrl,
          region: credentialRow.region,
          endpointUrl: subscription.endpointUrl,
          webhookSecret: "",
          subscribedEvents: subscription.subscribedEvents,
          providerWebhookId: subscription.providerWebhookId,
          fetchFn: input.fetchFn,
        });
      } catch {
        await updateProviderWebhookSubscription({
          subscriptionId: subscription.id,
          organizationId: subscription.organizationId,
          lastAuditedAt: new Date(),
          lastError: "Failed to reconcile stale provider webhook configuration",
        });
        results.push({
          subscriptionId: subscription.id,
          action: "unchanged",
          status: subscription.status,
        });
        continue;
      }

      const updated = await updateProviderWebhookSubscription({
        subscriptionId: subscription.id,
        organizationId: subscription.organizationId,
        status: "active",
        lastAuditedAt: new Date(),
        lastError: null,
      });

      results.push({
        subscriptionId: subscription.id,
        action: "reconciled",
        status: updated.status,
      });
      continue;
    }

    await updateProviderWebhookSubscription({
      subscriptionId: subscription.id,
      organizationId: subscription.organizationId,
      lastAuditedAt: new Date(),
    });

    results.push({
      subscriptionId: subscription.id,
      action: "unchanged",
      status: subscription.status,
    });
  }

  return results;
}

export async function ensureProviderWebhookSubscriptionsForCredential(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string;
  fetchFn?: typeof fetch;
}) {
  const projects = await db
    .select({
      id: schema.projects.id,
      externalProjectId: schema.projects.externalProjectId,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.source, "external_tms"),
        eq(schema.projects.externalProviderKind, input.providerKind),
        eq(schema.projects.isActive, true),
      ),
    );

  const results: ProviderWebhookSubscriptionSetupResult[] = [];

  for (const project of projects) {
    results.push(
      await ensureProviderWebhookSubscription({
        organizationId: input.organizationId,
        providerKind: input.providerKind,
        providerCredentialId: input.providerCredentialId,
        projectId: project.id,
        externalProjectId: project.externalProjectId,
        fetchFn: input.fetchFn,
      }),
    );
  }

  return results;
}
