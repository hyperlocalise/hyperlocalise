"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight01Icon,
  BookOpenTextIcon,
  FolderKanbanIcon,
  Link01Icon,
  MoreHorizontalIcon,
  WorkHistoryIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import { TmsProviderBrandMark } from "@/lib/providers/shared/tms-provider-brand-mark";

import { ProviderKindBadge, SyncStateBadge } from "../../_components/workspace-files-shared";
import { toneClass } from "../../_components/workspace-resource-shared";
import type { GlossaryListRow } from "./glossary-list";
import { providerLabel } from "./glossary-list";
import { glossariesTableMessages } from "./glossaries-table.messages";

export type GlossariesTableQuery = Pick<
  UseQueryResult<unknown, Error>,
  "isLoading" | "isError" | "isSuccess" | "error"
> & {
  refetch?: () => void;
};

function SourceLabel({ glossary }: { glossary: GlossaryListRow }) {
  if (glossary.source === "native") {
    return (
      <span className="text-xs text-muted-foreground">
        <FormattedMessage {...glossariesTableMessages.sourceWorkspace} />
      </span>
    );
  }

  if (glossary.externalProviderKind) {
    return <ProviderKindBadge kind={glossary.externalProviderKind} />;
  }

  return (
    <span className="text-xs text-muted-foreground">
      <FormattedMessage {...glossariesTableMessages.sourceExternalTms} />
    </span>
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
  return (
    <Badge variant="outline" className={toneClass(glossary.termCapabilityTone)}>
      {glossary.termCapabilityLabel}
    </Badge>
  );
}

function LiveApiBadge({ glossary }: { glossary: GlossaryListRow }) {
  return (
    <Badge
      variant="outline"
      className="border-grove-700/25 bg-grove-100 text-grove-900 dark:border-grove-500/30 dark:bg-grove-100 dark:text-grove-900"
    >
      <HugeiconsIcon icon={Link01Icon} strokeWidth={1.8} className="size-3.5" aria-hidden="true" />
      {glossary.termCapabilityLabel}
    </Badge>
  );
}

function GlossarySourceMark({ glossary }: { glossary: GlossaryListRow }) {
  const brandKind = glossary.source === "native" ? "native" : glossary.externalProviderKind;

  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60">
      {glossary.providerLogoSrc && brandKind ? (
        <TmsProviderBrandMark
          providerKind={brandKind}
          className="size-11 rounded-lg border-0 bg-transparent p-1 [&_img]:max-h-8 [&_img]:max-w-8 [&_svg]:size-7"
        />
      ) : (
        <HugeiconsIcon
          icon={BookOpenTextIcon}
          strokeWidth={1.7}
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function GlossaryInfoCell({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <span className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </span>
      <div className="min-w-0 max-w-full text-sm text-foreground">{children}</div>
    </div>
  );
}

function GlossaryRowActions({
  glossary,
  organizationSlug,
}: {
  glossary: GlossaryListRow;
  organizationSlug: string;
}) {
  const intl = useIntl();
  const projectHref = glossary.projectLinkId
    ? `/org/${organizationSlug}/projects/${glossary.projectLinkId}`
    : null;
  const jobsHref = `/org/${organizationSlug}/jobs`;
  const hasProjectActions = Boolean(glossary.projectLinkId);
  const primaryAction = glossary.externalUrl
    ? "provider"
    : glossary.projectLinkId
      ? "project"
      : null;

  if (!primaryAction && !glossary.externalProjectId) {
    return null;
  }

  return (
    <div className="col-span-2 flex flex-wrap justify-start gap-2 pt-1 md:justify-end">
      {primaryAction ? (
        <ButtonGroup>
          {primaryAction === "provider" ? (
            <Button
              nativeButton={false}
              render={<a href={glossary.externalUrl!} target="_blank" rel="noreferrer noopener" />}
              variant="default"
              size="sm"
              className="gap-1.5 text-xs"
            >
              <FormattedMessage {...glossariesTableMessages.openInProvider} />
              <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={1.7} className="size-3.5" />
            </Button>
          ) : (
            <Button
              nativeButton={false}
              render={<Link href={projectHref!} />}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
            >
              <HugeiconsIcon icon={FolderKanbanIcon} strokeWidth={1.8} className="size-3.5" />
              <FormattedMessage {...glossariesTableMessages.viewLinkedProject} />
            </Button>
          )}
          {hasProjectActions ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={intl.formatMessage(glossariesTableMessages.moreActions)}
                    className="text-muted-foreground"
                  />
                }
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                {primaryAction === "provider" ? (
                  <DropdownMenuItem render={<Link href={projectHref!} />}>
                    <HugeiconsIcon icon={FolderKanbanIcon} strokeWidth={1.8} />
                    <FormattedMessage {...glossariesTableMessages.viewLinkedProject} />
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem render={<Link href={jobsHref} />}>
                  <HugeiconsIcon icon={WorkHistoryIcon} strokeWidth={1.8} />
                  <FormattedMessage {...glossariesTableMessages.viewJobs} />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </ButtonGroup>
      ) : (
        <span className="self-center text-xs text-muted-foreground">
          <FormattedMessage
            {...glossariesTableMessages.externalProject}
            values={{ projectId: glossary.externalProjectId! }}
          />
        </span>
      )}
    </div>
  );
}

function GlossaryRowSkeleton() {
  return (
    <div className="grid gap-5 px-5 py-5 md:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)] md:items-start">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-3 w-48 max-w-full" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 pt-1 md:pt-0">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
    </div>
  );
}

function GlossaryRow({
  glossary,
  organizationSlug,
}: {
  glossary: GlossaryListRow;
  organizationSlug: string;
}) {
  const intl = useIntl();
  const detailId = glossary.detailId;
  const sourceDetail =
    glossary.source === "native"
      ? intl.formatMessage(glossariesTableMessages.nativeSourceDetail, {
          localePair: glossary.localePairLabel,
          timestamp: glossary.updatedAt,
        })
      : [
          glossary.externalProviderKind
            ? providerLabel(glossary.externalProviderKind)
            : intl.formatMessage(glossariesTableMessages.providerFallback),
          glossary.externalProjectId
            ? intl.formatMessage(glossariesTableMessages.projectId, {
                projectId: glossary.externalProjectId,
              })
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="grid gap-5 px-5 py-5 transition-colors hover:bg-muted/20 md:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)] md:items-start">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <GlossarySourceMark glossary={glossary} />
          {detailId ? (
            <Link
              href={`/org/${organizationSlug}/glossaries/${detailId}`}
              className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground underline-offset-2 hover:underline"
            >
              {glossary.name}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {glossary.name}
            </span>
          )}
          <SourceLabel glossary={glossary} />
          <ResourceTypeBadge glossary={glossary} />
        </div>
        <TypographyP className="mt-1 text-xs text-muted-foreground">{sourceDetail}</TypographyP>
        <div className="mt-4 max-w-full">
          <GlossaryInfoCell label={intl.formatMessage(glossariesTableMessages.languagesLabel)}>
            <div
              className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5"
              title={glossary.localeSummary}
            >
              <span className="inline-flex max-w-full shrink-0 items-center rounded-md border border-grove-700/25 bg-grove-100 px-2 py-1 text-xs font-medium leading-5 text-grove-900 dark:border-grove-500/30 dark:bg-grove-100 dark:text-grove-900">
                {glossary.sourceLocaleLabel}
              </span>
              {glossary.secondaryLocaleSummary ? (
                <>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>
                  <span className="min-w-0 max-w-full break-words leading-5 text-muted-foreground">
                    {glossary.secondaryLocaleSummary}
                  </span>
                </>
              ) : null}
            </div>
          </GlossaryInfoCell>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-5 gap-y-4 md:pt-0">
        <GlossaryInfoCell label={intl.formatMessage(glossariesTableMessages.termsLabel)}>
          <FormattedMessage
            {...glossariesTableMessages.termCount}
            values={{ countLabel: glossary.termCountLabel }}
          />
        </GlossaryInfoCell>
        <GlossaryInfoCell label={intl.formatMessage(glossariesTableMessages.updatedLabel)}>
          <span className="text-muted-foreground">
            {glossary.lastSyncedAt ?? glossary.updatedAt}
          </span>
        </GlossaryInfoCell>
        <GlossaryInfoCell label={intl.formatMessage(glossariesTableMessages.integrationLabel)}>
          <div className="flex flex-wrap gap-1.5">
            {glossary.isLiveApi ? <LiveApiBadge glossary={glossary} /> : null}
            {!glossary.isLiveApi && glossary.syncState ? (
              <SyncStateBadge syncState={glossary.syncState} />
            ) : null}
            {!glossary.isLiveApi ? <TermCapabilityBadge glossary={glossary} /> : null}
          </div>
        </GlossaryInfoCell>
        <GlossaryRowActions glossary={glossary} organizationSlug={organizationSlug} />
      </div>
    </div>
  );
}

export function GlossariesTable({
  glossaries,
  glossariesQuery,
  organizationSlug,
  title,
  headerActions,
  count,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  glossaries: GlossaryListRow[];
  glossariesQuery: GlossariesTableQuery;
  organizationSlug: string;
  title?: string;
  headerActions?: ReactNode;
  count?: number;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
}) {
  const intl = useIntl();

  return (
    <section
      aria-label={title ?? intl.formatMessage(glossariesTableMessages.sectionLabel)}
      className="min-w-0"
    >
      {title ? (
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
            {count !== undefined ? (
              <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
            ) : null}
          </div>
          {headerActions}
        </div>
      ) : null}

      {glossariesQuery.isLoading ? (
        <div
          className="overflow-hidden rounded-lg border border-border"
          aria-busy="true"
          aria-label={intl.formatMessage(glossariesTableMessages.loading)}
        >
          <TypographyP className="border-b border-border px-5 py-3 text-sm text-muted-foreground">
            <FormattedMessage {...glossariesTableMessages.loading} />
          </TypographyP>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index}>
              <GlossaryRowSkeleton />
              {index < 2 ? <Separator className="bg-skeleton" /> : null}
            </div>
          ))}
        </div>
      ) : null}

      {glossariesQuery.isError ? (
        <div className="py-8">
          <TypographyP className="text-sm font-medium text-flame-100">
            <FormattedMessage {...glossariesTableMessages.loadFailed} />
          </TypographyP>
          <TypographyP className="mt-1 text-xs text-muted-foreground">
            {glossariesQuery.error instanceof Error
              ? glossariesQuery.error.message
              : intl.formatMessage(glossariesTableMessages.loadFailedFallback)}
          </TypographyP>
          {glossariesQuery.refetch ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={glossariesQuery.refetch}
            >
              <FormattedMessage {...glossariesTableMessages.retry} />
            </Button>
          ) : null}
        </div>
      ) : null}

      {glossariesQuery.isSuccess && glossaries.length === 0 ? (
        <div className="space-y-3 py-10">
          <TypographyP className="text-sm font-medium text-foreground">{emptyTitle}</TypographyP>
          <TypographyP className="max-w-xl text-sm leading-6 text-muted-foreground">
            {emptyDescription}
          </TypographyP>
          {emptyAction}
        </div>
      ) : null}

      {glossariesQuery.isSuccess && glossaries.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          {glossaries.map((glossary, index) => (
            <div key={glossary.id}>
              <GlossaryRow glossary={glossary} organizationSlug={organizationSlug} />
              {index < glossaries.length - 1 ? <Separator className="bg-skeleton" /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function GlossariesEmptyAction({
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
      {label ?? <FormattedMessage {...glossariesTableMessages.connectProvider} />}
    </Button>
  );
}
