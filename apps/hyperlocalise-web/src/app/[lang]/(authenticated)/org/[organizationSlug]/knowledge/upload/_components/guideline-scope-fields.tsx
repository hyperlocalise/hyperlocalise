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
import { useId, useMemo, useState, type ReactNode } from "react";
import {
  CaretDownIcon,
  FoldersIcon,
  GlobeSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatLocaleDisplayName,
  formatLocaleOptionLabel,
} from "@/lib/i18n/locale-display-names.messages";
import {
  canonicalizeLocale,
  COMMON_LOCALES,
  getLocaleFlagEmoji,
  isValidLocaleInput,
} from "@/lib/i18n/locales";
import { cn } from "@/lib/primitives/cn";

import { guidelineUploadMessages as messages } from "./guideline-upload.messages";

export type GuidelineProjectScope = "none" | "all" | "selected";

type ProjectOption = { id: string; name: string };

/** Custom entries must look like a language code (`fr`, `pt-BR`, `zh-Hant-TW`), not a word. */
const CUSTOM_LOCALE_PATTERN = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i;
/** Selected names shown in a pill before collapsing to a count. */
const MAX_PILL_NAMES = 2;

function matches(query: string, ...values: string[]) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => value.toLowerCase().includes(needle));
}

/** Filter-style pill: icon, muted label, current value, caret. */
function ScopePill({
  icon,
  label,
  value,
  active,
  invalid,
}: {
  icon: ReactNode;
  label: ReactNode;
  value: ReactNode;
  active: boolean;
  invalid?: boolean;
}) {
  return (
    <PopoverTrigger
      render={
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-invalid={invalid ? true : undefined}
          className={cn(
            "h-8 max-w-full rounded-full ps-2.5 pe-2 font-normal",
            active && "border-primary/30 bg-primary/5 hover:bg-primary/10",
          )}
        />
      }
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium text-foreground">{value}</span>
      <CaretDownIcon className="size-3.5 text-muted-foreground" />
    </PopoverTrigger>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <MagnifyingGlassIcon className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 ps-8"
      />
    </div>
  );
}

function CheckRow({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
      <Checkbox checked={checked} onCheckedChange={(next) => onCheckedChange(next === true)} />
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
    </label>
  );
}

function LocalesPill({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (locales: string[]) => void;
  suggestions: string[];
}) {
  const intl = useIntl();
  const [query, setQuery] = useState("");

  const options = useMemo(() => {
    const codes = new Set<string>([...COMMON_LOCALES, ...suggestions, ...value]);
    return [...codes]
      .map((id) => ({
        id,
        label: formatLocaleDisplayName(intl, id),
        searchValue: formatLocaleOptionLabel(intl, id),
        flag: getLocaleFlagEmoji(id),
      }))
      .toSorted((a, b) => a.label.localeCompare(b.label, intl.locale));
  }, [intl, suggestions, value]);

  const selected = useMemo(() => options.filter((o) => value.includes(o.id)), [options, value]);
  const visible = options.filter((o) => matches(query, o.label, o.searchValue, o.id));

  const typed = query.trim();
  const customLocale =
    typed && CUSTOM_LOCALE_PATTERN.test(typed) && isValidLocaleInput(typed)
      ? (canonicalizeLocale(typed) as string)
      : null;
  const showCustom =
    customLocale != null && !options.some((o) => o.id.toLowerCase() === customLocale.toLowerCase());

  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...value, id] : value.filter((locale) => locale !== id));

  const summary =
    selected.length === 0 ? (
      <FormattedMessage {...messages.localesAll} />
    ) : selected.length <= MAX_PILL_NAMES ? (
      selected.map((o) => o.label).join(", ")
    ) : (
      <FormattedMessage {...messages.localesCount} values={{ count: selected.length }} />
    );

  return (
    <Popover onOpenChange={(open) => !open && setQuery("")}>
      <ScopePill
        icon={<GlobeSimpleIcon className="size-4" />}
        label={<FormattedMessage {...messages.localesLabel} />}
        value={summary}
        active={selected.length > 0}
      />
      <PopoverContent align="start" className="w-80 gap-2 p-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={intl.formatMessage(messages.localesSearchPlaceholder)}
        />
        <div className="flex items-center justify-between px-2 text-xs text-muted-foreground">
          <FormattedMessage {...messages.localesHint} />
          {selected.length > 0 ? (
            <Button
              type="button"
              variant="link"
              size="xs"
              className="h-auto px-0"
              onClick={() => onChange([])}
            >
              <FormattedMessage {...messages.clear} />
            </Button>
          ) : null}
        </div>
        <div className="-mx-2 max-h-72 overflow-y-auto px-2">
          {visible.map((o) => (
            <CheckRow
              key={o.id}
              checked={value.includes(o.id)}
              onCheckedChange={(checked) => toggle(o.id, checked)}
            >
              {o.flag ? (
                <span aria-hidden="true" className="leading-none">
                  {o.flag}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              <span className="text-xs text-muted-foreground">{o.id}</span>
            </CheckRow>
          ))}
          {showCustom ? (
            <button
              type="button"
              onClick={() => {
                toggle(customLocale, true);
                setQuery("");
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-muted"
            >
              <PlusIcon className="size-4 text-muted-foreground" />
              <FormattedMessage {...messages.addCustomLocale} values={{ locale: customLocale }} />
            </button>
          ) : null}
          {visible.length === 0 && !showCustom ? (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              <FormattedMessage {...messages.noMatchingLocales} />
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const SCOPE_OPTIONS = [
  ["none", messages.projectScopeNone, messages.projectScopeNoneHint],
  ["all", messages.projectScopeAll, messages.projectScopeAllHint],
  ["selected", messages.projectScopeSelected, messages.projectScopeSelectedHint],
] as const;

function ProjectsPill({
  scope,
  onScopeChange,
  selectedIds,
  onSelectedIdsChange,
  projects,
  loadingProjects,
  invalid,
}: {
  scope: GuidelineProjectScope;
  onScopeChange: (scope: GuidelineProjectScope) => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  projects: ProjectOption[];
  loadingProjects: boolean;
  invalid: boolean;
}) {
  const intl = useIntl();
  const groupId = useId();
  const [query, setQuery] = useState("");
  const selected = projects.filter((project) => selectedIds.includes(project.id));
  const visible = projects.filter((project) => matches(query, project.name));

  const summary =
    scope === "none" ? (
      <FormattedMessage {...messages.projectScopeNone} />
    ) : scope === "all" ? (
      <FormattedMessage {...messages.projectScopeAll} />
    ) : selected.length === 0 ? (
      <FormattedMessage {...messages.projectsChooseSummary} />
    ) : selected.length <= MAX_PILL_NAMES ? (
      selected.map((project) => project.name).join(", ")
    ) : (
      <FormattedMessage {...messages.projectsCount} values={{ count: selected.length }} />
    );

  return (
    <Popover onOpenChange={(open) => !open && setQuery("")}>
      <ScopePill
        icon={<FoldersIcon className="size-4" />}
        label={<FormattedMessage {...messages.projectScopeLabel} />}
        value={summary}
        active={scope !== "none"}
        invalid={invalid}
      />
      <PopoverContent align="start" className="w-80 gap-2 p-2">
        <div role="radiogroup" aria-labelledby={groupId} className="flex flex-col gap-0.5">
          <span id={groupId} className="sr-only">
            <FormattedMessage {...messages.projectScopeLabel} />
          </span>
          {SCOPE_OPTIONS.map(([value, label, hint]) => {
            const checked = scope === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => onScopeChange(value)}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-start hover:bg-muted",
                  checked && "bg-muted",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input",
                    checked && "border-primary",
                  )}
                >
                  {checked ? <span className="size-2 rounded-full bg-primary" /> : null}
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-medium">
                    <FormattedMessage {...label} />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <FormattedMessage {...hint} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {scope === "selected" ? (
          <div className="flex flex-col gap-2 border-t border-border pt-2">
            {loadingProjects ? (
              <Skeleton className="h-20 w-full" />
            ) : projects.length === 0 ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                <FormattedMessage {...messages.noProjects} />
              </p>
            ) : (
              <>
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder={intl.formatMessage(messages.projectsSearchPlaceholder)}
                />
                <div className="-mx-2 max-h-56 overflow-y-auto px-2">
                  {visible.map((project) => (
                    <CheckRow
                      key={project.id}
                      checked={selectedIds.includes(project.id)}
                      onCheckedChange={(checked) =>
                        onSelectedIdsChange(
                          checked
                            ? [...selectedIds, project.id]
                            : selectedIds.filter((id) => id !== project.id),
                        )
                      }
                    >
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    </CheckRow>
                  ))}
                  {visible.length === 0 ? (
                    <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                      <FormattedMessage {...messages.noMatchingProjects} />
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Compact "Applies to" bar for the guideline create page: locale and project
 * scope live in pill popovers so the content area keeps the full width.
 */
export function GuidelineScopeToolbar({
  locales,
  onLocalesChange,
  localeSuggestions,
  scope,
  onScopeChange,
  selectedIds,
  onSelectedIdsChange,
  projects,
  loadingProjects,
  error,
}: {
  locales: string[];
  onLocalesChange: (locales: string[]) => void;
  localeSuggestions: string[];
  scope: GuidelineProjectScope;
  onScopeChange: (scope: GuidelineProjectScope) => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  projects: ProjectOption[];
  loadingProjects: boolean;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="me-1 text-sm text-muted-foreground">
          <FormattedMessage {...messages.appliesToHeading} />
        </span>
        <LocalesPill value={locales} onChange={onLocalesChange} suggestions={localeSuggestions} />
        <ProjectsPill
          scope={scope}
          onScopeChange={onScopeChange}
          selectedIds={selectedIds}
          onSelectedIdsChange={onSelectedIdsChange}
          projects={projects}
          loadingProjects={loadingProjects}
          invalid={Boolean(error)}
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
