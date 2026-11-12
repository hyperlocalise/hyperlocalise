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
import { useId, useMemo, type ReactNode } from "react";
import {
  CaretDownIcon,
  FoldersIcon,
  GlobeSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { observer } from "mobx-react-lite";
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
import { COMMON_LOCALES, getLocaleFlagEmoji } from "@/lib/i18n/locales";
import { cn } from "@/lib/primitives/cn";

import { customLocaleFromQuery, matchesSearchQuery } from "../store/guideline-upload-page-store";
import { useGuidelineUploadPageStore } from "../store/guideline-upload-store-context";
import { guidelineUploadMessages as messages } from "./guideline-upload.messages";

type ProjectOption = { id: string; name: string };

/** Selected names shown in a pill before collapsing to a count. */
const MAX_PILL_NAMES = 2;

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

const LocalesPill = observer(function LocalesPill({ suggestions }: { suggestions: string[] }) {
  const intl = useIntl();
  const store = useGuidelineUploadPageStore();
  const { locales, localeQuery } = store;

  const options = useMemo(() => {
    const codes = new Set<string>([...COMMON_LOCALES, ...suggestions, ...locales]);
    return [...codes]
      .map((id) => ({
        id,
        label: formatLocaleDisplayName(intl, id),
        searchValue: formatLocaleOptionLabel(intl, id),
        flag: getLocaleFlagEmoji(id),
      }))
      .toSorted((a, b) => a.label.localeCompare(b.label, intl.locale));
  }, [intl, suggestions, locales]);

  const selected = options.filter((option) => locales.includes(option.id));
  const visible = options.filter((option) =>
    matchesSearchQuery(localeQuery, option.label, option.searchValue, option.id),
  );
  const customLocale = customLocaleFromQuery(
    localeQuery,
    options.map((option) => option.id),
  );

  const summary =
    selected.length === 0 ? (
      <FormattedMessage {...messages.localesAll} />
    ) : selected.length <= MAX_PILL_NAMES ? (
      selected.map((option) => option.label).join(", ")
    ) : (
      <FormattedMessage {...messages.localesCount} values={{ count: selected.length }} />
    );

  return (
    <Popover onOpenChange={(open) => !open && store.setLocaleQuery("")}>
      <ScopePill
        icon={<GlobeSimpleIcon className="size-4" />}
        label={<FormattedMessage {...messages.localesLabel} />}
        value={summary}
        active={selected.length > 0}
      />
      <PopoverContent align="start" className="w-80 gap-2 p-2">
        <SearchInput
          value={localeQuery}
          onChange={(query) => store.setLocaleQuery(query)}
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
              onClick={() => store.clearLocales()}
            >
              <FormattedMessage {...messages.clear} />
            </Button>
          ) : null}
        </div>
        <div className="-mx-2 max-h-72 overflow-y-auto px-2">
          {visible.map((option) => (
            <CheckRow
              key={option.id}
              checked={locales.includes(option.id)}
              onCheckedChange={(checked) => store.toggleLocale(option.id, checked)}
            >
              {option.flag ? (
                <span aria-hidden="true" className="leading-none">
                  {option.flag}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.id}</span>
            </CheckRow>
          ))}
          {customLocale ? (
            <button
              type="button"
              onClick={() => store.addCustomLocale(customLocale)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-muted"
            >
              <PlusIcon className="size-4 text-muted-foreground" />
              <FormattedMessage {...messages.addCustomLocale} values={{ locale: customLocale }} />
            </button>
          ) : null}
          {visible.length === 0 && !customLocale ? (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              <FormattedMessage {...messages.noMatchingLocales} />
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
});

const SCOPE_OPTIONS = [
  ["none", messages.projectScopeNone, messages.projectScopeNoneHint],
  ["all", messages.projectScopeAll, messages.projectScopeAllHint],
  ["selected", messages.projectScopeSelected, messages.projectScopeSelectedHint],
] as const;

const ProjectsPill = observer(function ProjectsPill({
  projects,
  loadingProjects,
}: {
  projects: ProjectOption[];
  loadingProjects: boolean;
}) {
  const intl = useIntl();
  const groupId = useId();
  const store = useGuidelineUploadPageStore();
  const { scope, selectedProjectIds, projectQuery } = store;
  const selected = projects.filter((project) => selectedProjectIds.includes(project.id));
  const visible = projects.filter((project) => matchesSearchQuery(projectQuery, project.name));

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
    <Popover onOpenChange={(open) => !open && store.setProjectQuery("")}>
      <ScopePill
        icon={<FoldersIcon className="size-4" />}
        label={<FormattedMessage {...messages.projectScopeLabel} />}
        value={summary}
        active={scope !== "none"}
        invalid={store.showProjectRequiredError}
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
                onClick={() => store.setScope(value)}
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
                  value={projectQuery}
                  onChange={(query) => store.setProjectQuery(query)}
                  placeholder={intl.formatMessage(messages.projectsSearchPlaceholder)}
                />
                <div className="-mx-2 max-h-56 overflow-y-auto px-2">
                  {visible.map((project) => (
                    <CheckRow
                      key={project.id}
                      checked={selectedProjectIds.includes(project.id)}
                      onCheckedChange={(checked) => store.toggleProject(project.id, checked)}
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
});

/**
 * Compact "Applies to" bar for the guideline create page: locale and project
 * scope live in pill popovers so the content area keeps the full width. Reads
 * and writes scope through the page store; project data comes from the query.
 */
export const GuidelineScopeToolbar = observer(function GuidelineScopeToolbar({
  localeSuggestions,
  projects,
  loadingProjects,
}: {
  localeSuggestions: string[];
  projects: ProjectOption[];
  loadingProjects: boolean;
}) {
  const store = useGuidelineUploadPageStore();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="me-1 text-sm text-muted-foreground">
          <FormattedMessage {...messages.appliesToHeading} />
        </span>
        <LocalesPill suggestions={localeSuggestions} />
        <ProjectsPill projects={projects} loadingProjects={loadingProjects} />
      </div>
      {store.showProjectRequiredError ? (
        <p className="text-sm text-destructive" role="alert">
          <FormattedMessage {...messages.projectRequired} />
        </p>
      ) : null}
    </div>
  );
});
