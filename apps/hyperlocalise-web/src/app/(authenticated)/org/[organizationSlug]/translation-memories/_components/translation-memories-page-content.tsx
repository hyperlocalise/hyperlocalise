"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight01Icon,
  DatabaseSyncIcon,
  FileSyncIcon,
  LanguageSquareIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import type { MemoriesResponse } from "@/api/routes/memory/memory.schema";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api-client-instance";

import {
  formatRelativeTimestamp,
  ProviderKindBadge,
  SyncStateBadge,
} from "../../_components/workspace-files-shared";
import {
  MetricsGrid,
  PageHeader,
  ResourceCard,
  toneClass,
  type Tone,
} from "../../_components/workspace-resource-shared";
import { TypographyP } from "@/components/ui/typography";

function memoryTone(syncState: string | null, hasError: boolean): Tone {
  if (hasError) {
    return "risk";
  }
  if (syncState === "synced") {
    return "safe";
  }
  if (syncState === "stale" || syncState === "changed") {
    return "watch";
  }
  return "info";
}

export function TranslationMemoriesPageContent({ organizationSlug }: { organizationSlug: string }) {
  const memoriesQuery = useQuery({
    queryKey: ["workspace-translation-memories", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"].$get({
        param: { organizationSlug },
        query: { limit: "100", offset: "0" },
      });

      if (!response.ok) {
        throw new Error(`Failed to load translation memories (${response.status})`);
      }

      return (await response.json()) as MemoriesResponse;
    },
  });

  const memories = memoriesQuery.data?.memories ?? [];

  const metrics = useMemo(() => {
    const segments = memories.reduce((total, memory) => total + (memory.segmentCount ?? 0), 0);
    const locales = new Set(memories.flatMap((memory) => memory.localeCoverage));
    const synced = memories.filter((memory) => memory.syncState === "synced").length;
    const issues = memories.filter((memory) => memory.lastSyncErrorMessage).length;

    return [
      {
        label: "Segments",
        value: segments > 0 ? segments.toLocaleString() : "—",
        detail: "synced from providers",
        tone: "safe" as const,
      },
      {
        label: "Locales",
        value: locales.size > 0 ? String(locales.size) : "—",
        detail: `${synced} memories synced`,
        tone: "info" as const,
      },
      {
        label: "Sync issues",
        value: String(issues),
        detail: issues > 0 ? "needs review" : "none reported",
        tone: (issues > 0 ? "watch" : "safe") as Tone,
      },
    ];
  }, [memories]);

  const statusLabel = memoriesQuery.isLoading ? "Loading" : `${memories.length} memories`;

  return (
    <main className="space-y-5">
      <PageHeader
        icon={DatabaseSyncIcon}
        label="Manage"
        title="Translation Memories"
        description="Manage reusable translated segments, source matching, and synchronization state for future localization work."
        statusLabel={statusLabel}
      />

      <MetricsGrid metrics={metrics} />

      <div className="flex items-center gap-2 text-sm text-foreground/54">
        <span>Synced provider translation memories appear here alongside workspace memories.</span>
        <Link
          href={`/org/${organizationSlug}/integrations`}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <span>Connect a provider</span>
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-4" />
        </Link>
      </div>

      <ResourceCard
        title="Memory stores"
        description="Translation memories synced from Crowdin and other TMS providers."
        icon={FileSyncIcon}
      >
        {memoriesQuery.isError ? (
          <TypographyP className="px-5 py-4 text-sm text-destructive">
            Could not load translation memories.
          </TypographyP>
        ) : null}
        {!memoriesQuery.isLoading && memories.length === 0 ? (
          <TypographyP className="px-5 py-4 text-sm text-foreground/48">
            No translation memories yet. Sync translation memories from a Crowdin project to see
            them here.
          </TypographyP>
        ) : null}
        {memories.map((memory, index) => {
          const tone = memoryTone(memory.syncState, Boolean(memory.lastSyncErrorMessage));
          const localeLabel =
            memory.localeCoverage.length > 0 ? `${memory.localeCoverage.length} locales` : "—";

          return (
            <div key={memory.id}>
              <div className="grid gap-3 px-5 py-4 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <HugeiconsIcon
                      icon={LanguageSquareIcon}
                      strokeWidth={1.7}
                      className="size-4 text-foreground/42"
                    />
                    <TypographyP className="truncate text-sm font-medium text-foreground">
                      {memory.name}
                    </TypographyP>
                    {memory.externalProviderKind ? (
                      <ProviderKindBadge kind={memory.externalProviderKind} />
                    ) : null}
                  </div>
                  <TypographyP className="mt-1 text-xs text-foreground/42">
                    {memory.source === "external_tms" ? "External TMS" : "Workspace"} · Updated{" "}
                    {formatRelativeTimestamp(memory.lastSyncedAt ?? memory.updatedAt)}
                  </TypographyP>
                </div>
                <TypographyP className="text-sm text-foreground/58">{localeLabel}</TypographyP>
                <TypographyP className="text-sm text-foreground/58">
                  {memory.segmentCount != null
                    ? `${memory.segmentCount.toLocaleString()} segments`
                    : "—"}
                </TypographyP>
                {memory.syncState ? (
                  <SyncStateBadge syncState={memory.syncState} />
                ) : (
                  <Badge variant="outline" className={toneClass(tone)}>
                    {memory.lastSyncErrorMessage ? "Error" : memory.status}
                  </Badge>
                )}
              </div>
              {index < memories.length - 1 ? <Separator className="bg-foreground/8" /> : null}
            </div>
          );
        })}
      </ResourceCard>
    </main>
  );
}
