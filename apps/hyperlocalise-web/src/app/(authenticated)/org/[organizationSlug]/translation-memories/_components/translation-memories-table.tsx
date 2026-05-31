"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Alert02Icon, ArrowUpRight01Icon, LanguageSquareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UseQueryResult } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyP } from "@/components/ui/typography";

import { ProviderKindBadge, SyncStateBadge } from "../../_components/workspace-files-shared";
import { toneClass } from "../../_components/workspace-resource-shared";
import type { MemoryListRow } from "./memory-list";
import { providerLabel } from "./memory-list";

function SourceLabel({ memory }: { memory: MemoryListRow }) {
  if (memory.source === "native") {
    return <span className="text-xs text-foreground/48">Workspace</span>;
  }

  if (memory.externalProviderKind) {
    return <ProviderKindBadge kind={memory.externalProviderKind} />;
  }

  return <span className="text-xs text-foreground/48">External TMS</span>;
}

function SyncHealthBadge({ memory }: { memory: MemoryListRow }) {
  if (memory.source === "native") {
    return (
      <Badge variant="outline" className={toneClass("info")}>
        Active
      </Badge>
    );
  }

  if (memory.lastSyncErrorAt) {
    return (
      <Badge variant="destructive" className="text-[10px]">
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.8} className="size-3" />
        Sync error
      </Badge>
    );
  }

  if (memory.syncState) {
    return <SyncStateBadge syncState={memory.syncState} />;
  }

  return (
    <Badge variant="outline" className="text-[10px] text-foreground/58">
      Not synced
    </Badge>
  );
}

function CapabilityBadge({ memory }: { memory: MemoryListRow }) {
  const tone =
    memory.capabilityMode === "reference_only"
      ? "watch"
      : memory.capabilityMode === "live_search"
        ? "info"
        : "safe";

  return (
    <Badge variant="outline" className={toneClass(tone)}>
      {memory.capabilityLabel}
    </Badge>
  );
}

function MemoryRow({
  memory,
  organizationSlug,
}: {
  memory: MemoryListRow;
  organizationSlug: string;
}) {
  const sourceDetail =
    memory.source === "native"
      ? `Updated ${memory.updatedAt}`
      : [
          memory.externalProviderKind ? providerLabel(memory.externalProviderKind) : "Provider",
          memory.externalProjectId ? `Project ${memory.externalProjectId}` : null,
          memory.lastSyncedAt ? `Synced ${memory.lastSyncedAt}` : "Not synced yet",
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[1.4fr_1fr_0.9fr_0.9fr_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <HugeiconsIcon
            icon={LanguageSquareIcon}
            strokeWidth={1.7}
            className="size-4 shrink-0 text-foreground/42"
          />
          <TypographyP className="truncate text-sm font-medium text-foreground">
            {memory.name}
          </TypographyP>
          <SourceLabel memory={memory} />
        </div>
        <TypographyP className="mt-1 text-xs text-foreground/42">{sourceDetail}</TypographyP>
        {memory.lastSyncErrorAt ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="mt-1 block text-xs text-destructive">
                  Last sync failed {memory.lastSyncErrorAt}
                </span>
              }
            />
            <TooltipContent side="bottom" align="start" className="max-w-xs">
              <p className="text-xs">{memory.lastSyncErrorMessage ?? "Unknown error"}</p>
            </TooltipContent>
          </Tooltip>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {memory.projectLinkId ? (
            <Link
              href={`/org/${organizationSlug}/projects/${memory.projectLinkId}`}
              className="text-xs text-foreground/58 underline-offset-2 hover:text-foreground hover:underline"
            >
              View linked project
            </Link>
          ) : memory.externalProjectId ? (
            <span className="text-xs text-foreground/42">
              External project {memory.externalProjectId}
            </span>
          ) : null}
          {memory.externalUrl ? (
            <a
              href={memory.externalUrl}
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
      <TypographyP className="text-sm text-foreground/58">{memory.localeSummary}</TypographyP>
      <TypographyP className="text-sm text-foreground/58">
        {memory.segmentCountLabel} segments
      </TypographyP>
      <div className="flex flex-wrap gap-2">
        <CapabilityBadge memory={memory} />
      </div>
      <SyncHealthBadge memory={memory} />
    </div>
  );
}

export function TranslationMemoriesTable({
  memories,
  memoriesQuery,
  organizationSlug,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  memories: MemoryListRow[];
  memoriesQuery: Pick<
    UseQueryResult<unknown, Error>,
    "isLoading" | "isError" | "isSuccess" | "error"
  >;
  organizationSlug: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
}) {
  return (
    <section aria-label="Translation memories" className="min-w-0">
      {memoriesQuery.isLoading ? (
        <TypographyP className="py-8 text-sm text-foreground/52">
          Loading translation memories...
        </TypographyP>
      ) : null}

      {memoriesQuery.isError ? (
        <div className="py-8">
          <TypographyP className="text-sm font-medium text-flame-100">
            Translation memories failed to load.
          </TypographyP>
          <TypographyP className="mt-1 text-xs text-foreground/42">
            {memoriesQuery.error instanceof Error
              ? memoriesQuery.error.message
              : "Try refreshing the page."}
          </TypographyP>
        </div>
      ) : null}

      {memoriesQuery.isSuccess && memories.length === 0 ? (
        <div className="space-y-3 py-10">
          <TypographyP className="text-sm font-medium text-foreground">{emptyTitle}</TypographyP>
          <TypographyP className="max-w-xl text-sm leading-6 text-foreground/52">
            {emptyDescription}
          </TypographyP>
          {emptyAction}
        </div>
      ) : null}

      {memoriesQuery.isSuccess && memories.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-foreground/8">
          {memories.map((memory, index) => (
            <div key={memory.id}>
              <MemoryRow memory={memory} organizationSlug={organizationSlug} />
              {index < memories.length - 1 ? <Separator className="bg-foreground/8" /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function TranslationMemoriesEmptyAction({
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
