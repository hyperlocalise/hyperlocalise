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
import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { TextFontIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TypographyP } from "@/components/ui/typography";

import { toneClass } from "../../_components/workspace-resource-shared";
import type { DictionaryListRow } from "./dictionary-list";
import { dictionariesTableMessages } from "./dictionaries-table.messages";

function statusLabel(status: DictionaryListRow["status"], intl: ReturnType<typeof useIntl>) {
  switch (status) {
    case "archived":
      return intl.formatMessage(dictionariesTableMessages.statusArchived);
    case "draft":
      return intl.formatMessage(dictionariesTableMessages.statusDraft);
    default:
      return intl.formatMessage(dictionariesTableMessages.statusActive);
  }
}

function DictionaryRow({
  dictionary,
  organizationSlug,
}: {
  dictionary: DictionaryListRow;
  organizationSlug: string;
}) {
  const intl = useIntl();
  const tone =
    dictionary.status === "active" ? "safe" : dictionary.status === "draft" ? "watch" : "info";

  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[1.6fr_0.8fr_0.8fr] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <HugeiconsIcon
            icon={TextFontIcon}
            strokeWidth={1.7}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <OrgNavLink
            href={`/org/${organizationSlug}/dictionaries/${dictionary.id}`}
            prefetch
            className="truncate text-sm font-medium text-foreground underline-offset-2 hover:underline"
          >
            {dictionary.name}
          </OrgNavLink>
        </div>
        {dictionary.description ? (
          <TypographyP className="mt-1" size="xsmall" tone="subtle">
            {dictionary.description}
          </TypographyP>
        ) : null}
      </div>
      <TypographyP size="xsmall" tone="subtle">
        <FormattedMessage
          {...dictionariesTableMessages.wordCount}
          values={{ count: dictionary.wordCount }}
        />
      </TypographyP>
      <Badge variant="outline" className={toneClass(tone)}>
        {statusLabel(dictionary.status, intl)}
      </Badge>
    </div>
  );
}

export function DictionariesTable({
  organizationSlug,
  dictionaries,
  isLoading,
  isError,
  isSuccess,
  error,
  emptyTitle,
  emptyDescription,
}: {
  organizationSlug: string;
  dictionaries: DictionaryListRow[];
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: Error | null;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const intl = useIntl();

  return (
    <section
      aria-label={intl.formatMessage(dictionariesTableMessages.sectionLabel)}
      className="min-w-0"
    >
      {isLoading ? (
        <TypographyP className="py-8" size="small" tone="subtle">
          <FormattedMessage {...dictionariesTableMessages.loading} />
        </TypographyP>
      ) : null}

      {isError ? (
        <div className="py-8">
          <TypographyP className="text-flame-100" size="small" weight="medium">
            <FormattedMessage {...dictionariesTableMessages.loadFailed} />
          </TypographyP>
          {error?.message ? (
            <TypographyP className="mt-1" size="xsmall" tone="subtle">
              {error.message}
            </TypographyP>
          ) : null}
        </div>
      ) : null}

      {isSuccess && dictionaries.length === 0 ? (
        <div className="space-y-3 py-10">
          <TypographyP size="small" weight="medium" tone="content">
            {emptyTitle}
          </TypographyP>
          <TypographyP className="max-w-xl leading-6" size="small" tone="subtle">
            {emptyDescription}
          </TypographyP>
        </div>
      ) : null}

      {isSuccess && dictionaries.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          {dictionaries.map((dictionary, index) => (
            <div key={dictionary.id}>
              <DictionaryRow dictionary={dictionary} organizationSlug={organizationSlug} />
              {index < dictionaries.length - 1 ? <Separator className="bg-skeleton" /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
