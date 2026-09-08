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
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown01Icon, SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import type { ProjectLocaleProgressRow } from "@/api/routes/project/project.schema";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyP } from "@/components/ui/typography";
import { formatLocaleDisplayName } from "@/lib/i18n/locale-display-names.messages";
import { localeBadgeCode } from "@/lib/projects/locale-progress/project-locale-progress";
import { cn } from "@/lib/primitives/cn";

import { formatRelativeTimestamp } from "../../../_components/workspace-files-shared";
import { projectLocaleProgressListMessages as messages } from "./project-locale-progress-list.messages";
import {
  buildLocaleEditorHref,
  filterAndSortLocaleProgress,
  localeProgressCounts,
  remainingLocaleWork,
  type LocaleProgressSort,
  type LocaleProgressUnit,
} from "./project-locale-progress-list-model";

export type ProjectLocaleProgressListProps = {
  locales: readonly ProjectLocaleProgressRow[];
  isLoading?: boolean;
  isError?: boolean;
  settingsHref: string;
  stringsHref?: string | null;
};

function LocaleBadge({ locale }: { locale: string }) {
  return (
    <span className="inline-flex h-6 min-w-7 items-center justify-center rounded-md bg-muted px-1.5 font-mono text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      {localeBadgeCode(locale)}
    </span>
  );
}

function LocaleProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function ProgressDetailRow({
  label,
  tone,
  todo,
  done,
  percent,
}: {
  label: string;
  tone: "translated" | "approved";
  todo: number;
  done: number;
  percent: number;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_3.5rem] items-center gap-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            tone === "translated" ? "bg-primary" : "bg-emerald-600 dark:bg-emerald-500",
          )}
          aria-hidden
        />
        <span className="truncate text-foreground">{label}</span>
      </div>
      <span className="text-end font-mono text-[13px] tabular-nums text-muted-foreground">
        {todo}
      </span>
      <span className="text-end font-mono text-[13px] tabular-nums text-foreground">{done}</span>
      <span className="text-end font-mono text-[13px] tabular-nums text-muted-foreground">
        {percent}%
      </span>
    </div>
  );
}

function LocaleProgressDetails({
  row,
  unit,
  onUnitChange,
  stringsHref,
}: {
  row: ProjectLocaleProgressRow;
  unit: LocaleProgressUnit;
  onUnitChange: (unit: LocaleProgressUnit) => void;
  stringsHref: string | null | undefined;
}) {
  const intl = useIntl();
  const counts = localeProgressCounts(row, unit);
  const translatedTodo = Math.max(0, counts.total - counts.translated);
  const approvedTodo = Math.max(0, counts.total - counts.approved);
  const lastActivity = row.lastActivityAt
    ? intl.formatMessage(messages.lastActivity, {
        when: formatRelativeTimestamp(row.lastActivityAt),
      })
    : intl.formatMessage(messages.lastActivityNever);
  const translateHref = stringsHref
    ? buildLocaleEditorHref({
        stringsHref,
        locale: row.locale,
        queueFilter: "untranslated",
      })
    : null;
  const proofreadHref = stringsHref
    ? buildLocaleEditorHref({
        stringsHref,
        locale: row.locale,
        queueFilter: "needs_review",
      })
    : null;

  return (
    <Rows spacing="2u">
      <Tabs
        value={unit}
        onValueChange={(value) => {
          if (value === "words" || value === "phrases") {
            onUnitChange(value);
          }
        }}
      >
        <TabsList variant="line">
          <TabsTrigger value="words">
            <FormattedMessage {...messages.wordsTab} />
          </TabsTrigger>
          <TabsTrigger value="phrases">
            <FormattedMessage {...messages.stringsTab} />
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <TypographyP size="small" tone="subtle">
        {unit === "phrases" ? (
          <FormattedMessage {...messages.totalStrings} values={{ count: counts.total }} />
        ) : (
          <FormattedMessage {...messages.totalWords} values={{ count: counts.total }} />
        )}
      </TypographyP>

      <Rows spacing="1u">
        <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_3.5rem] gap-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          <span />
          <span className="text-end">
            <FormattedMessage {...messages.todo} />
          </span>
          <span className="text-end">
            <FormattedMessage {...messages.done} />
          </span>
          <span />
        </div>
        <ProgressDetailRow
          label={intl.formatMessage(messages.translated)}
          tone="translated"
          todo={translatedTodo}
          done={counts.translated}
          percent={row.translationProgress}
        />
        <ProgressDetailRow
          label={intl.formatMessage(messages.approved)}
          tone="approved"
          todo={approvedTodo}
          done={counts.approved}
          percent={row.approvalProgress}
        />
      </Rows>

      <Row spacing="1.5u" align="spaceBetween" alignY="center">
        <span className="text-xs text-muted-foreground">{lastActivity}</span>
        {translateHref && proofreadHref ? (
          <Row spacing="1u" alignY="center">
            <Button
              nativeButton={false}
              render={<Link href={translateHref} />}
              size="sm"
              variant="outline"
            >
              <FormattedMessage {...messages.translate} />
            </Button>
            <Button
              nativeButton={false}
              render={<Link href={proofreadHref} />}
              size="sm"
              variant="outline"
            >
              <FormattedMessage {...messages.proofread} />
            </Button>
          </Row>
        ) : null}
      </Row>
    </Rows>
  );
}

function LocaleProgressItem({
  row,
  stringsHref,
}: {
  row: ProjectLocaleProgressRow;
  stringsHref: string | null | undefined;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<LocaleProgressUnit>("words");
  const localeLabel = formatLocaleDisplayName(intl, row.locale);
  const remaining = remainingLocaleWork(row);
  const remainingMessage =
    row.words.total > 0 || row.phrases.total === 0
      ? messages.remainingWords
      : messages.remainingStrings;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Box
        border="standard"
        borderRadius="large"
        background={open ? "muted" : "transparent"}
        paddingX="2u"
        paddingY="1.5u"
      >
        <CollapsibleTrigger
          className="flex w-full min-w-0 cursor-pointer flex-col gap-2 text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label={intl.formatMessage(open ? messages.collapse : messages.expand, {
            locale: localeLabel,
          })}
        >
          <div className="flex w-full min-w-0 items-center gap-3">
            <LocaleBadge locale={row.locale} />
            <span className="w-36 shrink-0 truncate text-sm font-medium text-foreground">
              {localeLabel}
            </span>
            <div className="hidden min-w-0 flex-1 sm:block">
              <LocaleProgressBar
                value={row.translationProgress}
                label={intl.formatMessage(messages.progressLabel, {
                  locale: localeLabel,
                })}
              />
            </div>
            <span className="shrink-0 font-mono text-[13px] tabular-nums text-muted-foreground">
              <FormattedMessage
                {...messages.translationPercent}
                values={{ percent: row.translationProgress }}
              />
              <span aria-hidden> · </span>
              <FormattedMessage
                {...messages.approvalPercent}
                values={{ percent: row.approvalProgress }}
              />
            </span>
            <span className="hidden w-20 shrink-0 text-end font-mono text-[13px] tabular-nums text-muted-foreground sm:block">
              <FormattedMessage {...remainingMessage} values={{ count: remaining }} />
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={1.8}
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </div>
          <div className="sm:hidden">
            <LocaleProgressBar
              value={row.translationProgress}
              label={intl.formatMessage(messages.progressLabel, {
                locale: localeLabel,
              })}
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Box paddingTop="2u">
            <LocaleProgressDetails
              row={row}
              unit={unit}
              onUnitChange={setUnit}
              stringsHref={stringsHref}
            />
          </Box>
        </CollapsibleContent>
      </Box>
    </Collapsible>
  );
}

export function ProjectLocaleProgressList({
  locales,
  isLoading = false,
  isError = false,
  settingsHref,
  stringsHref,
}: ProjectLocaleProgressListProps) {
  const intl = useIntl();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LocaleProgressSort>("az");

  const visibleLocales = useMemo(
    () =>
      filterAndSortLocaleProgress(locales, {
        query,
        sort,
        getLabel: (locale) => formatLocaleDisplayName(intl, locale),
      }),
    [intl, locales, query, sort],
  );

  return (
    <Rows spacing="1.5u">
      <Row spacing="0" align="spaceBetween" alignY="baseline">
        <span className="text-xs font-medium tracking-wider text-foreground uppercase">
          <FormattedMessage {...messages.title} />
        </span>
        <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase tabular-nums">
          {locales.length}
        </span>
      </Row>
      <Separator className="bg-foreground" />

      {isLoading ? (
        <Rows spacing="1u">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </Rows>
      ) : isError ? (
        <Box paddingTop="1u">
          <TypographyP wrapStyle="pretty" size="small" tone="subtle">
            <FormattedMessage {...messages.loadError} />
          </TypographyP>
        </Box>
      ) : locales.length === 0 ? (
        <Box paddingTop="1u">
          <Rows spacing="1u">
            <TypographyP weight="medium" tone="content">
              <FormattedMessage {...messages.emptyTitle} />
            </TypographyP>
            <TypographyP wrapStyle="pretty" size="small" tone="subtle">
              <FormattedMessage {...messages.emptyDescription} />
            </TypographyP>
            <Link href={settingsHref} className="text-sm font-medium text-primary hover:underline">
              <FormattedMessage {...messages.viewSettings} />
            </Link>
          </Rows>
        </Box>
      ) : (
        <Rows spacing="1.5u">
          <Columns spacing="1u" collapseBelow="small" alignY="center">
            <Column width="fluid">
              <InputGroup className="max-w-sm">
                <InputGroupAddon>
                  <HugeiconsIcon icon={SearchIcon} strokeWidth={1.8} className="size-4" />
                </InputGroupAddon>
                <InputGroupInput
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder={intl.formatMessage(messages.searchPlaceholder)}
                  aria-label={intl.formatMessage(messages.searchPlaceholder)}
                />
              </InputGroup>
            </Column>
            <Column width="content">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSort((current) => (current === "az" ? "za" : "az"))}
              >
                <FormattedMessage {...(sort === "az" ? messages.sortAz : messages.sortZa)} />
              </Button>
            </Column>
          </Columns>

          {visibleLocales.length === 0 ? (
            <TypographyP wrapStyle="pretty" size="small" tone="subtle">
              <FormattedMessage {...messages.noSearchResults} values={{ query }} />
            </TypographyP>
          ) : (
            <Rows spacing="1u">
              {visibleLocales.map((row) => (
                <LocaleProgressItem key={row.locale} row={row} stringsHref={stringsHref} />
              ))}
            </Rows>
          )}
        </Rows>
      )}
    </Rows>
  );
}
