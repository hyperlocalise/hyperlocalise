"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { hasCapability } from "@/api/auth/policy";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { createApiClient } from "@/lib/api-client";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import type { ProviderSyncObservabilityEntry } from "@/lib/providers/sync/provider-sync-observability-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toneClass } from "../../_components/workspace-resource-shared";

const api = createApiClient();

function syncStatusTone(active: boolean) {
  return active ? ("safe" as const) : ("watch" as const);
}

function processingStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function ObservabilityEntryCard({
  entry,
  canRetry,
  onRetryIntent,
  retryingIntentId,
}: {
  entry: ProviderSyncObservabilityEntry;
  canRetry: boolean;
  onRetryIntent: (intentId: string) => void;
  retryingIntentId: string | null;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={toneClass(syncStatusTone(entry.automaticSyncActive))}>
          {entry.automaticSyncActive ? "Automatic sync active" : "Automatic sync inactive"}
        </Badge>
        {entry.projectId ? (
          <span className="text-xs text-muted-foreground">Project {entry.projectId}</span>
        ) : (
          <span className="text-xs text-muted-foreground">Organization scope</span>
        )}
      </div>

      <dl className="grid gap-2 text-muted-foreground">
        <div>
          <dt className="font-medium text-foreground">Latest webhook event</dt>
          <dd className="mt-0.5">
            {entry.latestWebhookEvent ? (
              <>
                <span className="capitalize">
                  {processingStatusLabel(entry.latestWebhookEvent.processingStatus)}
                </span>
                <span className="text-xs"> · {entry.latestWebhookEvent.eventType}</span>
                <p className="mt-1 font-mono text-xs">{entry.latestWebhookEvent.id}</p>
              </>
            ) : (
              "No events received yet"
            )}
          </dd>
        </div>

        <div>
          <dt className="font-medium text-foreground">Latest sync intent</dt>
          <dd className="mt-0.5">
            {entry.latestSyncIntent ? (
              <>
                <span className="capitalize">
                  {processingStatusLabel(entry.latestSyncIntent.status)} ·{" "}
                  {entry.latestSyncIntent.syncKind}
                </span>
                <p className="mt-1 font-mono text-xs">{entry.latestSyncIntent.id}</p>
                {entry.latestSyncIntent.lastError ? (
                  <p className="mt-1 text-destructive">{entry.latestSyncIntent.lastError}</p>
                ) : null}
                {canRetry && entry.latestSyncIntent.canRetry ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    disabled={retryingIntentId === entry.latestSyncIntent.id}
                    onClick={() => onRetryIntent(entry.latestSyncIntent!.id)}
                  >
                    {retryingIntentId === entry.latestSyncIntent.id
                      ? "Retrying..."
                      : "Retry sync intent"}
                  </Button>
                ) : null}
              </>
            ) : (
              "No sync intents yet"
            )}
          </dd>
        </div>

        <div>
          <dt className="font-medium text-foreground">Latest provider sync run</dt>
          <dd className="mt-0.5">
            {entry.latestSyncRun ? (
              <>
                <span className="capitalize">
                  {processingStatusLabel(entry.latestSyncRun.status)} · {entry.latestSyncRun.kind}
                </span>
                <p className="mt-1 font-mono text-xs">{entry.latestSyncRun.id}</p>
              </>
            ) : (
              "No sync runs yet"
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function TmsSyncObservabilityPanel({
  organizationSlug,
  providerKind,
  membershipRole,
  enabled,
}: {
  organizationSlug: string;
  providerKind: ExternalTmsProviderKind;
  membershipRole: OrganizationMembershipRole;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const userIsAdmin = hasCapability(membershipRole, "provider_credentials:write");

  const observabilityQuery = useQuery({
    queryKey: ["provider-sync-observability", organizationSlug, providerKind],
    enabled,
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
        ":providerKind"
      ]["sync-observability"].$get({
        param: { organizationSlug, providerKind },
      });

      if (!res.ok) {
        throw new Error("Unable to load sync observability");
      }

      return res.json();
    },
  });

  const retryIntent = useMutation({
    mutationFn: async (intentId: string) => {
      const res = await api.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
        ":providerKind"
      ]["sync-intents"][":intentId"].retry.$post({
        param: { organizationSlug, providerKind, intentId },
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "sync_intent_retry_failed" }));
        throw new Error("message" in error ? String(error.message) : "Unable to retry sync intent");
      }

      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["provider-sync-observability", organizationSlug, providerKind],
      });
      toast.success("Sync intent requeued");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (!enabled) {
    return null;
  }

  if (observabilityQuery.isLoading) {
    return (
      <div className="space-y-2 rounded-lg border border-dashed border-border px-4 py-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (observabilityQuery.isError) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-destructive">
        Unable to load sync activity for this provider.
      </div>
    );
  }

  const entries = observabilityQuery.data?.providerSyncObservability.entries ?? [];
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        Sync activity appears after webhook subscriptions are created for synced projects.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Sync activity</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Trace the latest webhook delivery, queued sync intent, and provider sync run. IDs are safe
          for support debugging and do not include customer content.
        </p>
      </div>

      <div className="space-y-3">
        {entries.map((entry) => (
          <ObservabilityEntryCard
            key={entry.subscription.id}
            entry={entry}
            canRetry={userIsAdmin}
            onRetryIntent={(intentId) => retryIntent.mutate(intentId)}
            retryingIntentId={retryIntent.isPending ? (retryIntent.variables ?? null) : null}
          />
        ))}
      </div>
    </div>
  );
}
