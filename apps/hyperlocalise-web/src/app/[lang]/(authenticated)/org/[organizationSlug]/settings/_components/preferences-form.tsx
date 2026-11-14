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
import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { LocalePicker } from "@/components/locale-toggle/locale-picker";
import { themeToggleMessages } from "@/components/theme-toggle/theme-toggle.messages";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Box } from "@/components/ui/layout/box";
import { Rows } from "@/components/ui/layout/rows";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyP } from "@/components/ui/typography";
import { useUserPreferences } from "@/components/user-preferences/user-preferences-provider";
import type { AppLocale } from "@/lib/app-i18n/locales";
import {
  formatAutomationTimeZoneLabel,
  listAutomationTimeZones,
} from "@/lib/agents/automation-time-zones";
import type { UserAppearanceTheme, UserHourCycle } from "@/lib/database/schema/user-preferences";
import { cn } from "@/lib/primitives/cn";

import { preferencesFormMessages as messages } from "./preferences-form.messages";
import { SettingsSectionHeader } from "./settings-page-chrome";

const THEME_OPTIONS = [
  { value: "light", icon: SunIcon, label: themeToggleMessages.light },
  { value: "dark", icon: MoonIcon, label: themeToggleMessages.dark },
  { value: "system", icon: DesktopIcon, label: themeToggleMessages.system },
] as const;

type TimezoneOption = {
  id: string;
  label: string;
  searchValue: string;
};

function timezoneOffsetLabel(timezone: string, locale: string) {
  try {
    const part = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date())
      .find((entry) => entry.type === "timeZoneName")?.value;
    return part ?? timezone;
  } catch {
    return timezone;
  }
}

export function PreferencesForm() {
  const intl = useIntl();
  const { isLoading, isSaving, preferences, update } = useUserPreferences();
  const timezoneItems = useMemo<TimezoneOption[]>(() => {
    return listAutomationTimeZones(preferences.timezone).map((timezone) => {
      const name = formatAutomationTimeZoneLabel(timezone);
      const offset = timezoneOffsetLabel(timezone, intl.locale);
      return {
        id: timezone,
        label: `${name} (${offset})`,
        searchValue: `${timezone} ${name} ${offset}`,
      };
    });
  }, [intl.locale, preferences.timezone]);
  const selectedTimezone =
    timezoneItems.find((item) => item.id === preferences.timezone) ?? timezoneItems[0];
  const preview = intl.formatDate(new Date(), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: preferences.timezone,
    hourCycle: preferences.hourCycle,
  });

  if (isLoading) {
    return (
      <TypographyP size="small" tone="subtle">
        <FormattedMessage {...messages.saving} />
      </TypographyP>
    );
  }

  return (
    <Rows spacing="8u">
      <Rows spacing="3u">
        <SettingsSectionHeader
          title={intl.formatMessage(messages.appearanceTitle)}
          description={intl.formatMessage(messages.appearanceDescription)}
        />
        <Box paddingX="1u" paddingY="1u" border="standard" borderRadius="large">
          <div
            role="radiogroup"
            aria-label={intl.formatMessage(themeToggleMessages.colorThemeAria)}
            className="grid grid-cols-3 gap-1"
          >
            {THEME_OPTIONS.map(({ value, icon: Icon, label }) => {
              const checked = preferences.theme === value;
              return (
                <Button
                  key={value}
                  type="button"
                  variant={checked ? "secondary" : "ghost"}
                  role="radio"
                  aria-checked={checked}
                  disabled={isSaving}
                  className={cn("h-10 justify-center gap-2", checked && "shadow-sm")}
                  onClick={() => {
                    void update({ theme: value as UserAppearanceTheme });
                  }}
                >
                  <Icon className="size-4" />
                  <FormattedMessage {...label} />
                </Button>
              );
            })}
          </div>
        </Box>
      </Rows>

      <Rows spacing="3u">
        <SettingsSectionHeader
          title={intl.formatMessage(messages.languageTitle)}
          description={intl.formatMessage(messages.languageDescription)}
        />
        <LocalePicker
          activeLocale={preferences.locale}
          disabled={isSaving}
          onSelect={(locale: AppLocale) => {
            void update({ locale });
          }}
        />
      </Rows>

      <Rows spacing="3u">
        <SettingsSectionHeader
          title={intl.formatMessage(messages.timezoneTitle)}
          description={intl.formatMessage(messages.timezoneDescription)}
        />
        <Field>
          <FieldLabel className="sr-only">
            <FormattedMessage {...messages.timezoneLabel} />
          </FieldLabel>
          <Combobox
            items={timezoneItems}
            value={selectedTimezone}
            onValueChange={(next) => {
              if (next) {
                void update({ timezone: next.id });
              }
            }}
            itemToStringLabel={(item) => item.searchValue}
            isItemEqualToValue={(item, value) => item.id === value.id}
            disabled={isSaving}
          >
            <ComboboxInput
              showTrigger
              placeholder={intl.formatMessage(messages.timezoneSearch)}
              aria-label={intl.formatMessage(messages.timezoneLabel)}
            />
            <ComboboxContent>
              <ComboboxEmpty>
                <FormattedMessage {...messages.timezoneEmpty} />
              </ComboboxEmpty>
              <ComboboxList>
                {(item: TimezoneOption) => (
                  <ComboboxItem key={item.id} value={item}>
                    {item.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>
      </Rows>

      <Rows spacing="3u">
        <SettingsSectionHeader
          title={intl.formatMessage(messages.clockTitle)}
          description={intl.formatMessage(messages.clockDescription)}
        />
        <Field>
          <FieldLabel htmlFor="preferences-hour-cycle">
            <FormattedMessage {...messages.clockLabel} />
          </FieldLabel>
          <FieldDescription>
            <FormattedMessage {...messages.preview} values={{ sample: preview }} />
          </FieldDescription>
          <Select
            value={preferences.hourCycle}
            items={[
              { value: "h12", label: intl.formatMessage(messages.clock12) },
              { value: "h23", label: intl.formatMessage(messages.clock24) },
            ]}
            disabled={isSaving}
            onValueChange={(value) => {
              if (value === "h12" || value === "h23") {
                void update({ hourCycle: value as UserHourCycle });
              }
            }}
          >
            <SelectTrigger id="preferences-hour-cycle" className="w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="h12" label={intl.formatMessage(messages.clock12)}>
                <FormattedMessage {...messages.clock12} />
              </SelectItem>
              <SelectItem value="h23" label={intl.formatMessage(messages.clock24)}>
                <FormattedMessage {...messages.clock24} />
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Rows>

      {isSaving ? (
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.saving} />
        </TypographyP>
      ) : null}
    </Rows>
  );
}
