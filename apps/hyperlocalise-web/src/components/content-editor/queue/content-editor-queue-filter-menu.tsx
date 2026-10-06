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
import { CheckIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  crowdinQaQualifiersForProvider,
  isAdvancedQueueFilterSupportedForProvider,
  isCatQueueFilterEmpty,
  machineTranslationQualifiersForProvider,
  unresolvedIssueQualifiersForProvider,
  type ContentEditorAdvancedQueueFilter,
} from "@/lib/projects/content-editor/content-editor-advanced-queue-filter";
import { cn } from "@/lib/primitives/cn";
import { contentEditorQueuePanelMessages } from "@/components/content-editor/shared/content-editor.messages";

import {
  contentEditorQueueFilterValues,
  type ContentEditorQueueFilter,
  type ContentEditorQueueSort,
} from "./content-editor-queue-filter";
import { queueFilterMessageByValue } from "./content-editor-queue-filter-messages";
import {
  contentEditorAdvancedFilterMessages,
  contentEditorQueueFilterQualifierMessages,
} from "./content-editor-advanced-filter.messages";

const statusFilters: ContentEditorQueueFilter[] = [
  "untranslated",
  "needs_review",
  "reviewed",
  "unsaved",
];
const trailingFilters: ContentEditorQueueFilter[] = ["with_comments"];

function humanizeQualifier(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function qualifierLabel(intl: IntlShape, qualifier: string) {
  switch (qualifier) {
    case "tm":
      return intl.formatMessage(contentEditorQueueFilterQualifierMessages.tm);
    case "mt":
      return intl.formatMessage(contentEditorQueueFilterQualifierMessages.mt);
    case "ai":
      return intl.formatMessage(contentEditorQueueFilterQualifierMessages.ai);
    case "translation_job":
      return intl.formatMessage(contentEditorQueueFilterQualifierMessages.translationJob);
    case "agent":
      return intl.formatMessage(contentEditorQueueFilterQualifierMessages.agent);
    case "import":
      return intl.formatMessage(contentEditorQueueFilterQualifierMessages.import);
    case "general_question":
      return intl.formatMessage(contentEditorQueueFilterQualifierMessages.generalQuestion);
    case "translation_mistake":
      return intl.formatMessage(contentEditorQueueFilterQualifierMessages.translationMistake);
    case "context_request":
      return intl.formatMessage(contentEditorQueueFilterQualifierMessages.contextRequest);
    case "source_mistake":
      return intl.formatMessage(contentEditorQueueFilterQualifierMessages.sourceMistake);
    case "glossary_violation":
      return intl.formatMessage(contentEditorQueueFilterQualifierMessages.glossaryViolation);
    case "qa_failure":
      return intl.formatMessage(contentEditorQueueFilterQualifierMessages.qaFailure);
    default:
      return humanizeQualifier(qualifier);
  }
}

function FilterItem({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenuItem onClick={onClick} className="relative pe-8">
      {children}
      {selected ? (
        <CheckIcon className="pointer-events-none absolute end-2 size-4" aria-hidden />
      ) : null}
    </DropdownMenuItem>
  );
}

export function resolveQueueFilterButtonMessage({
  queueFilter,
  queueSort,
  queueAdvanced,
}: {
  queueFilter: ContentEditorQueueFilter;
  queueSort: ContentEditorQueueSort;
  queueAdvanced?: ContentEditorAdvancedQueueFilter;
}) {
  if (!isCatQueueFilterEmpty(queueAdvanced)) {
    return contentEditorAdvancedFilterMessages.title;
  }
  if (queueFilter === "all" && queueSort === "untranslated_first") {
    return contentEditorQueuePanelMessages.filterAllUntranslatedFirst;
  }
  return queueFilterMessageByValue[queueFilter];
}

export function ContentEditorQueueFilterMenu({
  queueFilter,
  queueSort,
  queueFilterQualifier,
  queueAdvanced,
  availableQueueFilters = contentEditorQueueFilterValues,
  availableQueueSorts = [],
  providerKind,
  onSelect,
  onOpenAdvanced,
}: {
  queueFilter: ContentEditorQueueFilter;
  queueSort: ContentEditorQueueSort;
  queueFilterQualifier?: string;
  queueAdvanced?: ContentEditorAdvancedQueueFilter;
  availableQueueFilters?: ContentEditorQueueFilter[];
  availableQueueSorts?: ContentEditorQueueSort[];
  providerKind?: string | null;
  onSelect: (input: {
    filter: ContentEditorQueueFilter;
    qualifier?: string;
    sort?: ContentEditorQueueSort;
  }) => void;
  onOpenAdvanced: () => void;
}) {
  const intl = useIntl();
  const available = new Set(availableQueueFilters);
  const advancedActive = !isCatQueueFilterEmpty(queueAdvanced);
  const supportsUntranslatedFirst = availableQueueSorts.includes("untranslated_first");
  const showAdvanced = isAdvancedQueueFilterSupportedForProvider(providerKind);

  const selectFilter = (filter: ContentEditorQueueFilter, qualifier?: string) => {
    onSelect({
      filter,
      qualifier,
      sort: filter === "all" ? "file_order" : undefined,
    });
  };

  const renderSubmenu = (filter: ContentEditorQueueFilter, qualifiers: readonly string[]) => {
    if (!available.has(filter)) {
      return null;
    }
    const parentSelected = !advancedActive && queueFilter === filter;
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className={cn(parentSelected && "bg-accent/60")}>
          <FormattedMessage {...queueFilterMessageByValue[filter]} />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-56">
          <FilterItem
            selected={parentSelected && !queueFilterQualifier}
            onClick={() => selectFilter(filter)}
          >
            <FormattedMessage {...contentEditorQueuePanelMessages.filterSubmenuAll} />
          </FilterItem>
          {qualifiers.map((qualifier) => (
            <FilterItem
              key={qualifier}
              selected={parentSelected && queueFilterQualifier === qualifier}
              onClick={() => selectFilter(filter, qualifier)}
            >
              {qualifierLabel(intl, qualifier)}
            </FilterItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  };

  return (
    <>
      <DropdownMenuGroup>
        {available.has("all") ? (
          <FilterItem
            selected={!advancedActive && queueFilter === "all" && queueSort === "file_order"}
            onClick={() => onSelect({ filter: "all", sort: "file_order" })}
          >
            <FormattedMessage {...contentEditorQueuePanelMessages.filterAll} />
          </FilterItem>
        ) : null}
        {available.has("all") && supportsUntranslatedFirst ? (
          <FilterItem
            selected={
              !advancedActive && queueFilter === "all" && queueSort === "untranslated_first"
            }
            onClick={() => onSelect({ filter: "all", sort: "untranslated_first" })}
          >
            <FormattedMessage {...contentEditorQueuePanelMessages.filterAllUntranslatedFirst} />
          </FilterItem>
        ) : null}
      </DropdownMenuGroup>

      {statusFilters.some((filter) => available.has(filter)) ? <DropdownMenuSeparator /> : null}

      <DropdownMenuGroup>
        {statusFilters.map((filter) =>
          available.has(filter) ? (
            <FilterItem
              key={filter}
              selected={!advancedActive && queueFilter === filter}
              onClick={() => selectFilter(filter)}
            >
              <FormattedMessage {...queueFilterMessageByValue[filter]} />
            </FilterItem>
          ) : null,
        )}
      </DropdownMenuGroup>

      {available.has("qa_issues") ||
      available.has("machine_translated") ||
      available.has("with_comments") ||
      available.has("has_issues") ||
      available.has("hidden") ||
      available.has("not_hidden") ||
      available.has("skipped") ? (
        <DropdownMenuSeparator />
      ) : null}

      <DropdownMenuGroup>
        {renderSubmenu("qa_issues", crowdinQaQualifiersForProvider(providerKind))}
        {renderSubmenu("machine_translated", machineTranslationQualifiersForProvider(providerKind))}
        {trailingFilters.map((filter) =>
          available.has(filter) ? (
            <FilterItem
              key={filter}
              selected={!advancedActive && queueFilter === filter}
              onClick={() => selectFilter(filter)}
            >
              <FormattedMessage {...queueFilterMessageByValue[filter]} />
            </FilterItem>
          ) : null,
        )}
        {renderSubmenu("has_issues", unresolvedIssueQualifiersForProvider(providerKind))}
        {available.has("hidden") ? (
          <FilterItem
            selected={!advancedActive && queueFilter === "hidden"}
            onClick={() => selectFilter("hidden")}
          >
            <FormattedMessage {...queueFilterMessageByValue.hidden} />
          </FilterItem>
        ) : null}
        {available.has("not_hidden") ? (
          <FilterItem
            selected={!advancedActive && queueFilter === "not_hidden"}
            onClick={() => selectFilter("not_hidden")}
          >
            <FormattedMessage {...queueFilterMessageByValue.not_hidden} />
          </FilterItem>
        ) : null}
        {available.has("skipped") ? (
          <FilterItem
            selected={!advancedActive && queueFilter === "skipped"}
            onClick={() => selectFilter("skipped")}
          >
            <FormattedMessage {...queueFilterMessageByValue.skipped} />
          </FilterItem>
        ) : null}
      </DropdownMenuGroup>

      {showAdvanced ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <FilterItem selected={advancedActive} onClick={onOpenAdvanced}>
              <FormattedMessage {...contentEditorQueuePanelMessages.filterAdvanced} />
            </FilterItem>
          </DropdownMenuGroup>
        </>
      ) : null}
    </>
  );
}
