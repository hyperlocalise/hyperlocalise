"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight01Icon, BookOpenTextIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TypographyP } from "@/components/ui/typography";

import { isLiveProviderGlossaryId } from "@/lib/providers/jobs/tms-provider-resource-id";
import { ProviderKindBadge } from "../../_components/workspace-files-shared";
import { toneClass } from "../../_components/workspace-resource-shared";
import type { GlossaryListRow } from "./glossary-list";
import { providerLabel } from "./glossary-list";
import { glossariesTableMessages } from "./glossaries-table.messages";

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

function GlossaryRow({
  glossary,
  organizationSlug,
}: {
  glossary: GlossaryListRow;
  organizationSlug: string;
}) {
  const intl = useIntl();
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
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[1.35fr_0.95fr_0.75fr_1fr] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <HugeiconsIcon
            icon={BookOpenTextIcon}
            strokeWidth={1.7}
            className="size-4 shrink-0 text-muted-foreground"
          />
          {isLiveProviderGlossaryId(glossary.id) ? (
            <span className="truncate text-sm font-medium text-foreground">{glossary.name}</span>
          ) : (
            <Link
              href={`/org/${organizationSlug}/glossaries/${glossary.id}`}
              className="truncate text-sm font-medium text-foreground underline-offset-2 hover:underline"
            >
              {glossary.name}
            </Link>
          )}
          <SourceLabel glossary={glossary} />
          <ResourceTypeBadge glossary={glossary} />
        </div>
        <TypographyP className="mt-1 text-xs text-muted-foreground">{sourceDetail}</TypographyP>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {glossary.projectLinkId ? (
            <>
              <Link
                href={`/org/${organizationSlug}/projects/${glossary.projectLinkId}`}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                <FormattedMessage {...glossariesTableMessages.viewLinkedProject} />
              </Link>
              <Link
                href={`/org/${organizationSlug}/jobs`}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                <FormattedMessage {...glossariesTableMessages.viewJobs} />
              </Link>
            </>
          ) : glossary.externalProjectId ? (
            <span className="text-xs text-muted-foreground">
              <FormattedMessage
                {...glossariesTableMessages.externalProject}
                values={{ projectId: glossary.externalProjectId }}
              />
            </span>
          ) : null}
          {glossary.externalUrl ? (
            <a
              href={glossary.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <FormattedMessage {...glossariesTableMessages.openInProvider} />
              <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={1.7} className="size-3.5" />
            </a>
          ) : null}
        </div>
      </div>
      <TypographyP className="text-sm text-muted-foreground">{glossary.localeSummary}</TypographyP>
      <TypographyP className="text-sm text-muted-foreground">
        <FormattedMessage
          {...glossariesTableMessages.termCount}
          values={{ countLabel: glossary.termCountLabel }}
        />
      </TypographyP>
      <div className="flex flex-wrap gap-2">
        <TermCapabilityBadge glossary={glossary} />
      </div>
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
  const intl = useIntl();

  return (
    <section
      aria-label={intl.formatMessage(glossariesTableMessages.sectionLabel)}
      className="min-w-0"
    >
      {glossariesQuery.isLoading ? (
        <TypographyP className="py-8 text-sm text-muted-foreground">
          <FormattedMessage {...glossariesTableMessages.loading} />
        </TypographyP>
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
