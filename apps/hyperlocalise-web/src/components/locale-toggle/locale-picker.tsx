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
import { useId, useMemo, useState, type Ref } from "react";
import { CheckIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import type { AppLocale } from "@/lib/app-i18n/locales";
import { cn } from "@/lib/primitives/cn";

import { localeDialogMessages } from "./locale-dialog.messages";
import {
  buildLocalePickerEntries,
  groupLocalePickerEntries,
  type AppLocaleRegionGroup,
  type LocalePickerEntry,
} from "./locale-regions";

const REGION_GROUP_MESSAGES = {
  americas: localeDialogMessages.regionAmericas,
  "asia-pacific": localeDialogMessages.regionAsiaPacific,
  europe: localeDialogMessages.regionEurope,
} as const satisfies Record<AppLocaleRegionGroup, MessageDescriptor>;

export function LocalePicker({
  activeLocale,
  disabled = false,
  onSelect,
  searchInputRef,
}: {
  activeLocale: AppLocale;
  disabled?: boolean;
  onSelect: (locale: AppLocale) => void;
  searchInputRef?: Ref<HTMLInputElement>;
}) {
  const intl = useIntl();
  const [query, setQuery] = useState("");
  const entries = useMemo(() => buildLocalePickerEntries(intl.locale), [intl.locale]);
  const groups = groupLocalePickerEntries(entries, query);

  return (
    <div className="flex min-h-0 flex-col gap-5">
      <InputGroup>
        <InputGroupAddon>
          <MagnifyingGlassIcon />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchInputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={intl.formatMessage(localeDialogMessages.searchPlaceholder)}
          aria-label={intl.formatMessage(localeDialogMessages.searchAria)}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
        />
      </InputGroup>

      <div className="-mx-2 min-h-40 overflow-y-auto px-2 pb-1">
        {groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground" role="status">
            <FormattedMessage {...localeDialogMessages.noResults} values={{ query }} />
          </p>
        ) : (
          <div className="grid gap-x-6 gap-y-6 sm:grid-cols-3">
            {groups.map(({ group, entries: groupEntries }) => (
              <LocaleRegionColumn
                key={group}
                group={group}
                entries={groupEntries}
                activeLocale={activeLocale}
                disabled={disabled}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LocaleRegionColumn({
  group,
  entries,
  activeLocale,
  disabled,
  onSelect,
}: {
  group: AppLocaleRegionGroup;
  entries: LocalePickerEntry[];
  activeLocale: AppLocale;
  disabled: boolean;
  onSelect: (locale: AppLocale) => void;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="px-2 text-sm font-semibold text-foreground">
        <FormattedMessage {...REGION_GROUP_MESSAGES[group]} />
      </h3>
      <ul className="flex flex-col gap-0.5">
        {entries.map((entry) => (
          <li key={entry.locale}>
            <LocaleOptionButton
              entry={entry}
              isActive={entry.locale === activeLocale}
              disabled={disabled}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LocaleOptionButton({
  entry,
  isActive,
  disabled,
  onSelect,
}: {
  entry: LocalePickerEntry;
  isActive: boolean;
  disabled: boolean;
  onSelect: (locale: AppLocale) => void;
}) {
  return (
    <button
      type="button"
      lang={entry.locale}
      aria-current={isActive ? "true" : undefined}
      disabled={disabled}
      onClick={() => onSelect(entry.locale)}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-start transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        isActive && "bg-muted",
      )}
    >
      <span aria-hidden="true" className="text-base leading-5">
        {entry.flag}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm leading-5 font-medium">{entry.nativeCountry}</span>
        <span className="truncate text-xs leading-4 text-muted-foreground">
          {entry.nativeLanguage}
        </span>
      </span>
      {isActive ? (
        <>
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
          <span className="sr-only">
            <FormattedMessage {...localeDialogMessages.currentLanguage} />
          </span>
        </>
      ) : null}
    </button>
  );
}
