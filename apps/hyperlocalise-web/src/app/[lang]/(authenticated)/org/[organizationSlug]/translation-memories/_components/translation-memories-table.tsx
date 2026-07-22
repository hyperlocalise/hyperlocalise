"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight01Icon, LanguageSquareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TypographyP } from "@/components/ui/typography";

import { isLiveProviderMemoryId } from "@/lib/providers/jobs/tms-provider-resource-id";
import { ProviderKindBadge } from "../../_components/workspace-files-shared";
import { toneClass } from "../../_components/workspace-resource-shared";
import type { MemoryListRow } from "./memory-list";
import { providerLabel } from "./memory-list";
import { translationMemoriesTableMessages } from "./translation-memories-table.messages";

function SourceLabel({ memory }: { memory: MemoryListRow }) {
  if (memory.source === "native") {
    return (
      <span className="text-xs text-muted-foreground">
        <FormattedMessage {...translationMemoriesTableMessages.sourceWorkspace} />
      </span>
    );
  }

  if (memory.externalProviderKind) {
    return <ProviderKindBadge kind={memory.externalProviderKind} />;
  }

  return (
    <span className="text-xs text-muted-foreground">
      <FormattedMessage {...translationMemoriesTableMessages.sourceExternalTms} />
    </span>
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
  const intl = useIntl();
  const sourceDetail =
    memory.source === "native"
      ? intl.formatMessage(translationMemoriesTableMessages.updatedAt, {
          timestamp: memory.updatedAt,
        })
      : [
          memory.externalProviderKind
            ? providerLabel(memory.externalProviderKind)
            : intl.formatMessage(translationMemoriesTableMessages.providerFallback),
          memory.externalProjectId
            ? intl.formatMessage(translationMemoriesTableMessages.projectId, {
                projectId: memory.externalProjectId,
              })
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[1.4fr_1fr_0.9fr_0.9fr] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <HugeiconsIcon
            icon={LanguageSquareIcon}
            strokeWidth={1.7}
            className="size-4 shrink-0 text-muted-foreground"
          />
          {isLiveProviderMemoryId(memory.id) ? (
            <span className="truncate text-sm font-medium text-foreground">{memory.name}</span>
          ) : (
            <Link
              href={`/org/${organizationSlug}/translation-memories/${memory.id}`}
              className="truncate text-sm font-medium text-foreground underline-offset-2 hover:underline"
            >
              {memory.name}
            </Link>
          )}
          <SourceLabel memory={memory} />
        </div>
        <TypographyP className="mt-1 text-xs text-muted-foreground">{sourceDetail}</TypographyP>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {memory.projectLinkId ? (
            <Link
              href={`/org/${organizationSlug}/projects/${memory.projectLinkId}`}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              <FormattedMessage {...translationMemoriesTableMessages.viewLinkedProject} />
            </Link>
          ) : memory.externalProjectId ? (
            <span className="text-xs text-muted-foreground">
              <FormattedMessage
                {...translationMemoriesTableMessages.externalProject}
                values={{ projectId: memory.externalProjectId }}
              />
            </span>
          ) : null}
          {memory.externalUrl ? (
            <a
              href={memory.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <FormattedMessage {...translationMemoriesTableMessages.openInProvider} />
              <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={1.7} className="size-3.5" />
            </a>
          ) : null}
        </div>
      </div>
      <TypographyP className="text-sm text-muted-foreground">{memory.localeSummary}</TypographyP>
      <TypographyP className="text-sm text-muted-foreground">
        <FormattedMessage
          {...translationMemoriesTableMessages.segmentCount}
          values={{ countLabel: memory.segmentCountLabel }}
        />
      </TypographyP>
      <div className="flex flex-wrap gap-2">
        <CapabilityBadge memory={memory} />
      </div>
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
  const intl = useIntl();

  return (
    <section
      aria-label={intl.formatMessage(translationMemoriesTableMessages.sectionLabel)}
      className="min-w-0"
    >
      {memoriesQuery.isLoading ? (
        <TypographyP className="py-8 text-sm text-muted-foreground">
          <FormattedMessage {...translationMemoriesTableMessages.loading} />
        </TypographyP>
      ) : null}

      {memoriesQuery.isError ? (
        <div className="py-8">
          <TypographyP className="text-sm font-medium text-flame-100">
            <FormattedMessage {...translationMemoriesTableMessages.loadFailed} />
          </TypographyP>
          <TypographyP className="mt-1 text-xs text-muted-foreground">
            {memoriesQuery.error instanceof Error
              ? memoriesQuery.error.message
              : intl.formatMessage(translationMemoriesTableMessages.loadFailedFallback)}
          </TypographyP>
        </div>
      ) : null}

      {memoriesQuery.isSuccess && memories.length === 0 ? (
        <div className="space-y-3 py-10">
          <TypographyP className="text-sm font-medium text-foreground">{emptyTitle}</TypographyP>
          <TypographyP className="max-w-xl text-sm leading-6 text-muted-foreground">
            {emptyDescription}
          </TypographyP>
          {emptyAction}
        </div>
      ) : null}

      {memoriesQuery.isSuccess && memories.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          {memories.map((memory, index) => (
            <div key={memory.id}>
              <MemoryRow memory={memory} organizationSlug={organizationSlug} />
              {index < memories.length - 1 ? <Separator className="bg-skeleton" /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function TranslationMemoriesEmptyAction({
  organizationSlug,
  label,
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
      {label ?? <FormattedMessage {...translationMemoriesTableMessages.connectProvider} />}
    </Button>
  );
}
