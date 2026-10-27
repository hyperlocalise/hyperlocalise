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
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiClient } from "@/lib/api-client-instance";
import type {
  WorkspaceAutomationFieldErrors,
  WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";
import { formatLocaleOptionLabel } from "@/lib/i18n/locale-display-names.messages";

type ExistingTranslationPolicy = "seed_empty" | "refresh_imported" | "overwrite_all";

const POLICY_LABELS: Record<ExistingTranslationPolicy, string> = {
  seed_empty: "Only empty locales",
  refresh_imported: "Refresh imported locales",
  overwrite_all: "Overwrite all locales",
};

type LibraryItem = { id: string; name: string };

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

function CustomerIoLibraryPicker({
  organizationSlug,
  endpoint,
  label,
  emptyLabel,
  helperText,
  enabled,
  connected,
  selectedIds,
  onToggle,
}: {
  organizationSlug: string;
  endpoint: "broadcasts" | "newsletters" | "transactional";
  label: string;
  emptyLabel: string;
  helperText: string;
  enabled: boolean;
  connected: boolean;
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const libraryQuery = useQuery({
    queryKey: [`customer-io-${endpoint}`, organizationSlug],
    enabled,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["customer-io"][endpoint].$get({
        param: { organizationSlug },
        query: {},
      });
      if (!response.ok) {
        throw new Error(`Failed to load Customer.io ${endpoint}`);
      }
      const body = await response.json();
      const items =
        endpoint === "transactional"
          ? (body as { transactionalMessages?: unknown }).transactionalMessages
          : (body as { broadcasts?: unknown; newsletters?: unknown })[endpoint];
      if (!Array.isArray(items)) {
        throw new Error(`Failed to load Customer.io ${endpoint}`);
      }
      return { items: items as LibraryItem[] };
    },
  });

  const items = useMemo(() => {
    const loaded = libraryQuery.data?.items ?? [];
    const byId = new Map(loaded.map((item) => [item.id, item]));
    const extras = selectedIds.filter((id) => !byId.has(id)).map((id) => ({ id, name: id }));
    return [...loaded, ...extras];
  }, [selectedIds, libraryQuery.data?.items]);
  const selectedNames = items
    .filter((item) => selectedIds.includes(item.id))
    .map((item) => item.name);

  return (
    <div className="space-y-2">
      <Label htmlFor={`customer-io-${endpoint}`}>{label}</Label>
      {libraryQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading {emptyLabel.toLowerCase()}…
        </div>
      ) : libraryQuery.isError ? (
        <p className="text-sm text-destructive">
          Failed to load Customer.io {emptyLabel.toLowerCase()}.
        </p>
      ) : (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                disabled={!connected || items.length === 0}
                className="w-full justify-between font-normal"
                id={`customer-io-${endpoint}`}
              />
            }
          >
            <span className="truncate text-left">
              {selectedNames.length > 0 ? selectedNames.join(", ") : emptyLabel}
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[var(--anchor-width)] p-0">
            <Command>
              <CommandInput placeholder="Search" />
              <CommandList label={label} aria-multiselectable={true}>
                <CommandEmpty>No items found.</CommandEmpty>
                <CommandGroup>
                  {items.map((item) => {
                    const checked = selectedIds.includes(item.id);
                    return (
                      <CommandItem
                        key={item.id}
                        value={`${item.id} ${item.name}`}
                        data-checked={checked || undefined}
                        aria-checked={checked}
                        onSelect={() => onToggle(item.id)}
                      >
                        <span className="truncate">{item.name}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
      <p className="text-xs text-muted-foreground">{helperText}</p>
    </div>
  );
}

function uniqueLocales(values: Array<string | null | undefined>): string[] {
  const locales: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const locale = value?.trim();
    if (!locale || seen.has(locale)) {
      continue;
    }
    seen.add(locale);
    locales.push(locale);
  }
  return locales;
}

export function WorkspaceAutomationCustomerIoSettings({
  organizationSlug,
  form,
  errors,
  customerIoConnected,
  projectSourceLocale,
  projectTargetLocales,
  onChange,
}: {
  organizationSlug: string;
  form: WorkspaceAutomationFormState;
  errors: WorkspaceAutomationFieldErrors;
  customerIoConnected: boolean;
  projectSourceLocale?: string | null;
  projectTargetLocales?: string[];
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  const intl = useIntl();
  const pickersEnabled = form.customerIoEnabled && customerIoConnected;
  const sourceLocaleOptions = uniqueLocales([
    projectSourceLocale,
    form.customerIoSourceLocale,
    ...(projectTargetLocales ?? []),
  ]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Only email (rich-text/code editor), push, Twilio SMS, and Slack actions are eligible.
        Drag-and-drop emails, transactional SMS, in-app messages, and multilingual A/B variants are
        skipped. Locales must already exist on the Customer.io action.
      </p>
      <div className="space-y-2">
        <Label htmlFor="customer-io-source-locale">Source locale</Label>
        <Select
          value={form.customerIoSourceLocale}
          onValueChange={(locale) => {
            if (typeof locale === "string") {
              onChange({ ...form, customerIoSourceLocale: locale });
            }
          }}
        >
          <SelectTrigger id="customer-io-source-locale" className="w-full">
            <SelectValue>
              {form.customerIoSourceLocale
                ? formatLocaleOptionLabel(intl, form.customerIoSourceLocale)
                : "Choose a source locale"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sourceLocaleOptions.map((locale) => (
              <SelectItem key={locale} value={locale} label={formatLocaleOptionLabel(intl, locale)}>
                {formatLocaleOptionLabel(intl, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <CustomerIoLibraryPicker
        organizationSlug={organizationSlug}
        endpoint="broadcasts"
        label="Broadcasts (optional)"
        emptyLabel="All broadcasts"
        helperText="Leave empty to discover every broadcast. Limit by campaign in the skill when needed."
        enabled={pickersEnabled}
        connected={customerIoConnected}
        selectedIds={form.customerIoBroadcastIds}
        onToggle={(id) =>
          onChange({ ...form, customerIoBroadcastIds: toggleId(form.customerIoBroadcastIds, id) })
        }
      />

      <CustomerIoLibraryPicker
        organizationSlug={organizationSlug}
        endpoint="newsletters"
        label="Newsletters (optional)"
        emptyLabel="All newsletters"
        helperText="Leave empty to discover every one-time send."
        enabled={pickersEnabled}
        connected={customerIoConnected}
        selectedIds={form.customerIoNewsletterIds}
        onToggle={(id) =>
          onChange({ ...form, customerIoNewsletterIds: toggleId(form.customerIoNewsletterIds, id) })
        }
      />

      <CustomerIoLibraryPicker
        organizationSlug={organizationSlug}
        endpoint="transactional"
        label="Transactional messages (optional)"
        emptyLabel="All transactional messages"
        helperText="Leave empty to discover every transactional template. Push only updates content — it never sends."
        enabled={pickersEnabled}
        connected={customerIoConnected}
        selectedIds={form.customerIoTransactionalMessageIds}
        onToggle={(id) =>
          onChange({
            ...form,
            customerIoTransactionalMessageIds: toggleId(form.customerIoTransactionalMessageIds, id),
          })
        }
      />

      <div className="space-y-2">
        <Label htmlFor="customer-io-existing-translation-policy">Existing translations</Label>
        <Select
          value={form.customerIoExistingTranslationPolicy}
          onValueChange={(policy) => {
            if (
              policy !== "seed_empty" &&
              policy !== "refresh_imported" &&
              policy !== "overwrite_all"
            ) {
              return;
            }
            onChange({ ...form, customerIoExistingTranslationPolicy: policy });
          }}
        >
          <SelectTrigger id="customer-io-existing-translation-policy" className="w-full">
            <SelectValue>{POLICY_LABELS[form.customerIoExistingTranslationPolicy]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(POLICY_LABELS) as Array<[ExistingTranslationPolicy, string]>).map(
              ([policy, label]) => (
                <SelectItem key={policy} value={policy} label={label}>
                  {label}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          When Customer.io already has a locale, import it into the project. The default never
          overwrites work already in Hyperlocalise.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.customerIoOverwriteWhenRemoteNewer}
          onCheckedChange={(checked) =>
            onChange({ ...form, customerIoOverwriteWhenRemoteNewer: checked === true })
          }
        />
        Overwrite translations when the remote locale is newer
      </label>
      {errors.customerIoSourceLocale ? (
        <p className="text-sm text-destructive">{errors.customerIoSourceLocale}</p>
      ) : null}
    </div>
  );
}
