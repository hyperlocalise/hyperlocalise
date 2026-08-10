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
import { useMemo } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatLocaleDisplayName,
  formatLocaleOptionLabel,
} from "@/lib/i18n/locale-display-names.messages";
import { cn } from "@/lib/primitives/cn";

import { issueLocalePickerMessages as messages } from "./issue-locale-picker.messages";

const ANY_LOCALE_VALUE = "__any_locale__";
const CLEAR_LOCALE_VALUE = "__clear_locale__";

export function buildIssueLocaleOptions(locales: string[], currentValue?: string | null) {
  const merged = new Set<string>();
  for (const locale of locales) {
    const trimmed = locale.trim();
    if (trimmed) {
      merged.add(trimmed);
    }
  }
  if (currentValue?.trim()) {
    merged.add(currentValue.trim());
  }
  return [...merged].toSorted((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function collectOrganizationIssueLocales(
  projects: Array<{ targetLocales?: string[] | null }>,
) {
  return buildIssueLocaleOptions(projects.flatMap((project) => project.targetLocales ?? []));
}

export function resolveIssueCreateLocaleOptions(input: {
  resolvedProjectId?: string;
  projects?: Array<{ id: string; targetLocales?: string[] | null }>;
  projectTargetLocales?: string[];
}) {
  if (input.resolvedProjectId) {
    const selectedProject = input.projects?.find(
      (project) => project.id === input.resolvedProjectId,
    );
    return selectedProject?.targetLocales ?? input.projectTargetLocales ?? [];
  }
  return collectOrganizationIssueLocales(input.projects ?? []);
}

export function sanitizeIssueCreateTargetLocale(input: {
  currentLocale: string;
  resolvedProjectId?: string;
  projects?: Array<{ id: string; targetLocales?: string[] | null }>;
  projectTargetLocales?: string[];
}) {
  const trimmedLocale = input.currentLocale.trim();
  if (!input.resolvedProjectId || !trimmedLocale) {
    return input.currentLocale;
  }

  const localeOptions = resolveIssueCreateLocaleOptions({
    resolvedProjectId: input.resolvedProjectId,
    projects: input.projects,
    projectTargetLocales: input.projectTargetLocales,
  });
  if (!localeOptions.length || !localeOptions.includes(trimmedLocale)) {
    return "";
  }

  return input.currentLocale;
}

export function IssueLocalePicker({
  value,
  onValueChange,
  locales,
  allowClear = false,
  allowAny = false,
  disabled = false,
  className,
  triggerClassName,
  placeholder,
  id,
  size = "default",
  showIcon = true,
  "aria-label": ariaLabel,
}: {
  value: string | null | undefined;
  onValueChange: (locale: string | null) => void;
  locales: string[];
  allowClear?: boolean;
  allowAny?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
  id?: string;
  size?: "sm" | "default";
  showIcon?: boolean;
  "aria-label"?: string;
}) {
  const intl = useIntl();
  const options = useMemo(() => buildIssueLocaleOptions(locales, value), [locales, value]);
  const resolvedPlaceholder = placeholder ?? intl.formatMessage(messages.placeholder);
  const trimmedValue = value?.trim() || null;
  const selectValue = trimmedValue
    ? trimmedValue
    : allowAny
      ? ANY_LOCALE_VALUE
      : allowClear
        ? CLEAR_LOCALE_VALUE
        : undefined;
  const hasChoices = options.length > 0 || allowAny || allowClear;

  return (
    <Select
      value={selectValue}
      disabled={disabled || !hasChoices}
      onValueChange={(next) => {
        if (!next || next === ANY_LOCALE_VALUE || next === CLEAR_LOCALE_VALUE) {
          onValueChange(null);
          return;
        }
        onValueChange(next);
      }}
    >
      <SelectTrigger
        id={id}
        size={size}
        showIcon={showIcon}
        aria-label={ariaLabel ?? resolvedPlaceholder}
        className={cn("w-full", triggerClassName)}
      >
        <SelectValue placeholder={resolvedPlaceholder}>
          {trimmedValue
            ? formatLocaleDisplayName(intl, trimmedValue)
            : allowAny
              ? intl.formatMessage(messages.anyLocale)
              : allowClear
                ? intl.formatMessage(messages.clearLocale)
                : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        className={cn("w-max min-w-[17rem] max-w-[min(22rem,calc(100vw-2rem))]", className)}
      >
        {allowAny ? (
          <SelectItem value={ANY_LOCALE_VALUE} label={intl.formatMessage(messages.anyLocale)}>
            <FormattedMessage {...messages.anyLocale} />
          </SelectItem>
        ) : null}
        {allowClear && !allowAny ? (
          <SelectItem value={CLEAR_LOCALE_VALUE} label={intl.formatMessage(messages.clearLocale)}>
            <FormattedMessage {...messages.clearLocale} />
          </SelectItem>
        ) : null}
        {options.length === 0 && !trimmedValue ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            <FormattedMessage {...messages.emptyProjectLocales} />
          </div>
        ) : null}
        {options.map((locale) => (
          <SelectItem key={locale} value={locale} label={formatLocaleOptionLabel(intl, locale)}>
            <span className="truncate">{formatLocaleDisplayName(intl, locale)}</span>
            <span className="font-mono text-muted-foreground">{locale}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
