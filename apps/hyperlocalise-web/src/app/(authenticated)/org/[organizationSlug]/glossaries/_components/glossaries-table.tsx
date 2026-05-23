"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Alert02Icon, ArrowUpRight01Icon, BookOpenTextIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UseQueryResult } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyP } from "@/components/ui/typography";

import { ProviderKindBadge, SyncStateBadge } from "../../_components/workspace-files-shared";
import { ResourceCard, toneClass } from "../../_components/workspace-resource-shared";
import type { GlossaryListRow } from "./glossary-list";
import { providerLabel } from "./glossary-list";

function SourceLabel({ glossary }: { glossary: GlossaryListRow }) {
  if (glossary.source === "native") {
    return <span className="text-xs text-foreground/48">Workspace</span>;
  }

  if (glossary.externalProviderKind) {
    return <ProviderKindBadge kind={glossary.externalProviderKind} />;
  }

  return <span className="text-xs text-foreground/48">External TMS</span>;
}

function SyncHealthBadge({ glossary }: { glossary: GlossaryListRow }) {
  if (glossary.source === "native") {
    return (
      <Badge variant="outline" className={toneClass("info")}>
        Active
      </Badge>
    );
  }

  if (glossary.lastSyncErrorAt) {
    return (
      <Badge variant="destructive" className="text-[10px]">
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.8} className="size-3" />
        Sync error
      </Badge>
    );
  }

  if (glossary.syncState) {
    return <SyncStateBadge syncState={glossary.syncState} />;
  }

  return (
    <Badge variant="outline" className="text-[10px] text-foreground/58">
      Not synced
    </Badge>
  );
}

function ResourceTypeBadge({ glossary }: { glossary: GlossaryListRow }) {
  const tone = glossary.externalResourceType === "term_base" ? "info" : "safe";

  return (
    <Badge variant="outline" className={toneClass(tone)}>
      {glossary.resourceTypeLabel}
    </Badge>
  );
}

function TermCapabilityBadge({ glossary }: { glossary: GlossaryListRow }) {
  const tone =
    glossary.termCapabilityLabel === "Capabilities unknown"
      ? "watch"
      : glossary.termCapabilityLabel.includes("No ")
        ? "watch"
        : "safe";

  return (
    <Badge variant="outline" className={toneClass(tone)}>
      {glossary.termCapabilityLabel}
    </Badge>
  );
}

function GlossaryRow({
  glossary,
  organizationSlug,
}: {
  glossary: GlossaryListRow;
  organizationSlug: string;
}) {
  const sourceDetail =
    glossary.source === "native"
      ? `${glossary.localePairLabel} · Updated ${glossary.updatedAt}`
      : [
          glossary.externalProviderKind ? providerLabel(glossary.externalProviderKind) : "Provider",
          glossary.externalProjectId ? `Project ${glossary.externalProjectId}` : null,
          glossary.lastSyncedAt ? `Synced ${glossary.lastSyncedAt}` : "Not synced yet",
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[1.35fr_0.95fr_0.75fr_1fr_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <HugeiconsIcon
            icon={BookOpenTextIcon}
            strokeWidth={1.7}
            className="size-4 shrink-0 text-foreground/42"
          />
          <TypographyP className="truncate text-sm font-medium text-foreground">
            {glossary.name}
          </TypographyP>
          <SourceLabel glossary={glossary} />
          <ResourceTypeBadge glossary={glossary} />
        </div>
        <TypographyP className="mt-1 text-xs text-foreground/42">{sourceDetail}</TypographyP>
        {glossary.lastSyncErrorAt ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="mt-1 block text-xs text-destructive">
                  Last sync failed {glossary.lastSyncErrorAt}
                </span>
              }
            />
            <TooltipContent side="bottom" align="start" className="max-w-xs">
              <p className="text-xs">{glossary.lastSyncErrorMessage ?? "Unknown error"}</p>
            </TooltipContent>
          </Tooltip>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {glossary.projectLinkId ? (
            <>
              <Link
                href={`/org/${organizationSlug}/projects/${glossary.projectLinkId}`}
                className="text-xs text-foreground/58 underline-offset-2 hover:text-foreground hover:underline"
              >
                View linked project
              </Link>
              <Link
                href={`/org/${organizationSlug}/jobs`}
                className="text-xs text-foreground/58 underline-offset-2 hover:text-foreground hover:underline"
              >
                View jobs
              </Link>
            </>
          ) : glossary.externalProjectId ? (
            <span className="text-xs text-foreground/42">
              External project {glossary.externalProjectId}
            </span>
          ) : null}
          {glossary.externalUrl ? (
            <a
              href={glossary.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-foreground/58 hover:text-foreground"
            >
              Open in provider
              <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={1.7} className="size-3.5" />
            </a>
          ) : null}
        </div>
      </div>
      <TypographyP className="text-sm text-foreground/58">{glossary.localeSummary}</TypographyP>
      <TypographyP className="text-sm text-foreground/58">
        {glossary.termCountLabel} terms
      </TypographyP>
      <div className="flex flex-wrap gap-2">
        <TermCapabilityBadge glossary={glossary} />
      </div>
      <SyncHealthBadge glossary={glossary} />
    </div>
  );
}

export function GlossariesTable({
  glossaries,
  glossariesQuery,
  organizationSlug,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  glossaries: GlossaryListRow[];
  glossariesQuery: Pick<
    UseQueryResult<unknown, Error>,
    "isLoading" | "isError" | "isSuccess" | "error"
  >;
  organizationSlug: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
}) {
  return (
    <ResourceCard
      title="Terminology resources"
      description="Native workspace glossaries and synced provider glossaries or term bases in one list."
      icon={BookOpenTextIcon}
    >
      {glossariesQuery.isLoading ? (
        <div className="px-5 py-8 text-sm text-foreground/52">Loading glossaries...</div>
      ) : null}

      {glossariesQuery.isError ? (
        <div className="px-5 py-8">
          <TypographyP className="text-sm font-medium text-flame-100">
            Glossaries failed to load.
          </TypographyP>
          <TypographyP className="mt-1 text-xs text-foreground/42">
            {glossariesQuery.error instanceof Error
              ? glossariesQuery.error.message
              : "Try refreshing the page."}
          </TypographyP>
        </div>
      ) : null}

      {glossariesQuery.isSuccess && glossaries.length === 0 ? (
        <div className="space-y-3 px-5 py-8">
          <TypographyP className="text-sm font-medium text-foreground">{emptyTitle}</TypographyP>
          <TypographyP className="text-sm text-foreground/52">{emptyDescription}</TypographyP>
          {emptyAction}
        </div>
      ) : null}

      {glossariesQuery.isSuccess && glossaries.length > 0
        ? glossaries.map((glossary, index) => (
            <div key={glossary.id}>
              <GlossaryRow glossary={glossary} organizationSlug={organizationSlug} />
              {index < glossaries.length - 1 ? <Separator className="bg-foreground/8" /> : null}
            </div>
          ))
        : null}
    </ResourceCard>
  );
}

export function GlossariesEmptyAction({
  organizationSlug,
  label = "Connect a provider",
}: {
  organizationSlug: string;
  label?: string;
}) {
  return (
    <Button
      nativeButton={false}
      render={<Link href={`/org/${organizationSlug}/integrations`} />}
      variant="outline"
      size="sm"
    >
      {label}
    </Button>
  );
}
