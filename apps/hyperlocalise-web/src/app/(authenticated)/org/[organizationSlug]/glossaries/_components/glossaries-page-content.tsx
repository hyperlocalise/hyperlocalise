"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight01Icon, BookOpenTextIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import type {
  GlossariesResponse,
  GlossaryRecord,
  GlossaryTermsResponse,
} from "@/api/routes/glossary/glossary.schema";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/utils";

import {
  formatRelativeTimestamp,
  ProviderKindBadge,
  SyncStateBadge,
} from "../../_components/workspace-files-shared";
import {
  MetricsGrid,
  PageHeader,
  ProgressBar,
  ResourceCard,
  toneClass,
  type Tone,
} from "../../_components/workspace-resource-shared";
import { TypographyP } from "@/components/ui/typography";

function glossaryStatusTone(glossary: GlossaryRecord): Tone {
  if (glossary.lastSyncErrorMessage) {
    return "risk";
  }
  if (glossary.syncState === "stale" || glossary.syncState === "changed") {
    return "watch";
  }
  if (glossary.syncState === "synced") {
    return "safe";
  }
  return "info";
}

function glossaryStatusLabel(glossary: GlossaryRecord): string {
  if (glossary.lastSyncErrorMessage) {
    return "Sync error";
  }
  if (glossary.syncState) {
    return glossary.syncState;
  }
  return glossary.status;
}

function termStatusTone(reviewStatus: string, forbidden: boolean): Tone {
  if (forbidden) {
    return "risk";
  }
  if (reviewStatus === "approved") {
    return "safe";
  }
  if (reviewStatus === "review") {
    return "watch";
  }
  return "info";
}

function termStatusLabel(reviewStatus: string, forbidden: boolean): string {
  if (forbidden) {
    return "Forbidden";
  }
  if (reviewStatus === "approved") {
    return "Approved";
  }
  return reviewStatus;
}

function coveragePercent(glossary: GlossaryRecord): number {
  if (glossary.termCount == null || glossary.termCount <= 0) {
    return glossary.source === "external_tms" && glossary.syncState === "synced" ? 100 : 0;
  }
  return Math.min(100, glossary.termCount > 0 ? 100 : 0);
}

export function GlossariesPageContent({ organizationSlug }: { organizationSlug: string }) {
  const glossariesQuery = useQuery({
    queryKey: ["workspace-glossaries", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries.$get({
        param: { organizationSlug },
        query: { limit: "100", offset: "0" },
      });

      if (!response.ok) {
        throw new Error(`Failed to load glossaries (${response.status})`);
      }

      return (await response.json()) as GlossariesResponse;
    },
  });

  const termsQuery = useQuery({
    queryKey: ["workspace-glossary-terms", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        "workspace-terms"
      ].$get({
        param: { organizationSlug },
        query: { limit: "20" },
      });

      if (!response.ok) {
        throw new Error(`Failed to load glossary terms (${response.status})`);
      }

      return (await response.json()) as GlossaryTermsResponse;
    },
  });

  const glossaries = glossariesQuery.data?.glossaries ?? [];
  const glossaryTerms = termsQuery.data?.glossaryTerms ?? [];

  const metrics = useMemo(() => {
    const connected = glossaries.filter((glossary) => glossary.source === "external_tms").length;
    const approvedTerms = glossaries.reduce(
      (total, glossary) => total + (glossary.termCount ?? 0),
      0,
    );
    const syncErrors = glossaries.filter((glossary) => glossary.lastSyncErrorMessage).length;

    return [
      {
        label: "Glossaries",
        value: String(glossaries.length),
        detail: connected > 0 ? `${connected} synced from TMS` : "workspace glossaries",
        tone: "info" as const,
      },
      {
        label: "Synced terms",
        value: approvedTerms > 0 ? approvedTerms.toLocaleString() : "—",
        detail: "stored in workspace",
        tone: "safe" as const,
      },
      {
        label: "Sync issues",
        value: String(syncErrors),
        detail: syncErrors > 0 ? "need attention" : "none reported",
        tone: (syncErrors > 0 ? "watch" : "safe") as Tone,
      },
    ];
  }, [glossaries]);

  const statusLabel =
    glossariesQuery.isLoading || termsQuery.isLoading
      ? "Loading"
      : `${glossaries.length} glossaries`;

  return (
    <main className="space-y-5">
      <PageHeader
        icon={BookOpenTextIcon}
        label="Term library"
        title="Glossaries"
        description="Manage approved product terms, legal wording, and locale-specific vocabulary that guides every translation run."
        statusLabel={statusLabel}
      />
      <MetricsGrid metrics={metrics} />
      <div className="flex items-center gap-2 text-sm text-foreground/54">
        <span>Synced provider glossaries appear here alongside workspace glossaries.</span>
        <Link
          href={`/org/${organizationSlug}/integrations`}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <span>Connect a provider</span>
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-4" />
        </Link>
      </div>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ResourceCard
          title="Glossary sets"
          description="Glossaries synced from Crowdin and other providers, plus native workspace libraries."
          icon={BookOpenTextIcon}
        >
          <div className="px-5 pb-2">
            {glossariesQuery.isError ? (
              <TypographyP className="py-4 text-sm text-destructive">
                Could not load glossaries.
              </TypographyP>
            ) : null}
            {!glossariesQuery.isLoading && glossaries.length === 0 ? (
              <TypographyP className="py-4 text-sm text-foreground/48">
                No glossaries yet. Sync glossaries from a Crowdin project or create a workspace
                glossary.
              </TypographyP>
            ) : null}
            {glossaries.map((glossary, index) => {
              const tone = glossaryStatusTone(glossary);
              const localeCount = glossary.localeCoverage.length || 1;

              return (
                <div key={glossary.id}>
                  <div className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_7rem_8rem_8rem] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <TypographyP className="truncate text-sm font-medium text-foreground">
                          {glossary.name}
                        </TypographyP>
                        {glossary.externalProviderKind ? (
                          <ProviderKindBadge kind={glossary.externalProviderKind} />
                        ) : null}
                        <Badge variant="outline" className={cn("rounded-full", toneClass(tone))}>
                          {glossaryStatusLabel(glossary)}
                        </Badge>
                        {glossary.syncState ? (
                          <SyncStateBadge syncState={glossary.syncState} />
                        ) : null}
                      </div>
                      <TypographyP className="mt-1 text-xs text-foreground/42">
                        {glossary.source === "external_tms" ? "External TMS" : "Workspace"} ·
                        Updated{" "}
                        {formatRelativeTimestamp(glossary.lastSyncedAt ?? glossary.updatedAt)}
                      </TypographyP>
                    </div>
                    <TypographyP className="text-sm text-foreground/58">
                      {glossary.termCount != null ? glossary.termCount.toLocaleString() : "—"} terms
                    </TypographyP>
                    <TypographyP className="text-sm text-foreground/58">
                      {localeCount} {localeCount === 1 ? "locale" : "locales"}
                    </TypographyP>
                    <div className="flex flex-col gap-2">
                      <ProgressBar value={coveragePercent(glossary)} tone={tone} />
                      <TypographyP className="text-xs text-foreground/42">
                        {glossary.sourceLocale} → {glossary.targetLocale}
                      </TypographyP>
                    </div>
                  </div>
                  {index < glossaries.length - 1 ? <Separator className="bg-foreground/8" /> : null}
                </div>
              );
            })}
          </div>
        </ResourceCard>
        <ResourceCard
          title="Term review"
          description="Recent terms from synced glossaries that localization jobs can enforce during drafting."
          icon={BookOpenTextIcon}
        >
          <div className="overflow-x-auto">
            <div className="min-w-176">
              <div className="grid grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_6rem_minmax(8rem,1fr)_7rem] gap-3 px-5 py-2 text-xs font-medium tracking-[0.08em] text-foreground/38 uppercase">
                <TypographyP>Source</TypographyP>
                <TypographyP>Approved term</TypographyP>
                <TypographyP>Locale</TypographyP>
                <TypographyP>Glossary</TypographyP>
                <TypographyP>Status</TypographyP>
              </div>
              <Separator className="bg-foreground/8" />
              {termsQuery.isError ? (
                <TypographyP className="px-5 py-4 text-sm text-destructive">
                  Could not load glossary terms.
                </TypographyP>
              ) : null}
              {!termsQuery.isLoading && glossaryTerms.length === 0 ? (
                <TypographyP className="px-5 py-4 text-sm text-foreground/48">
                  No synced terms yet. Run glossary sync on a Crowdin project to populate terms.
                </TypographyP>
              ) : null}
              {glossaryTerms.map((term, index) => {
                const tone = termStatusTone(term.reviewStatus, term.forbidden);

                return (
                  <div key={term.id}>
                    <div className="grid grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_6rem_minmax(8rem,1fr)_7rem] items-center gap-3 px-5 py-4">
                      <TypographyP className="truncate text-sm text-foreground">
                        {term.sourceTerm}
                      </TypographyP>
                      <TypographyP className="truncate text-sm text-foreground/72">
                        {term.targetTerm}
                      </TypographyP>
                      <TypographyP className="text-sm text-foreground/48">
                        {term.targetLocale}
                      </TypographyP>
                      <TypographyP className="truncate text-sm text-foreground/58">
                        {term.glossaryName}
                      </TypographyP>
                      <Badge variant="outline" className={cn("rounded-full", toneClass(tone))}>
                        {termStatusLabel(term.reviewStatus, term.forbidden)}
                      </Badge>
                    </div>
                    {index < glossaryTerms.length - 1 ? (
                      <Separator className="bg-foreground/8" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </ResourceCard>
      </section>
    </main>
  );
}
