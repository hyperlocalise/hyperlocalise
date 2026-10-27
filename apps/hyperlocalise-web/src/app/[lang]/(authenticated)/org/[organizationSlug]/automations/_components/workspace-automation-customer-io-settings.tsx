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
  const [broadcastPickerOpen, setBroadcastPickerOpen] = useState(false);
  const libraryQuery = useQuery({
    queryKey: ["customer-io-broadcasts", organizationSlug],
    enabled: form.customerIoEnabled && customerIoConnected,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["customer-io"].broadcasts.$get(
        {
          param: { organizationSlug },
          query: {},
        },
      );
      if (!response.ok) {
        throw new Error("Failed to load Customer.io broadcasts");
      }
      const body = await response.json();
      if (!("broadcasts" in body) || !Array.isArray(body.broadcasts)) {
        throw new Error("Failed to load Customer.io broadcasts");
      }
      return { broadcasts: body.broadcasts as LibraryItem[] };
    },
  });

  const broadcasts = useMemo(() => {
    const loaded = libraryQuery.data?.broadcasts ?? [];
    const byId = new Map(loaded.map((item) => [item.id, item]));
    const extras = form.customerIoBroadcastIds
      .filter((id) => !byId.has(id))
      .map((id) => ({ id, name: id }));
    return [...loaded, ...extras];
  }, [form.customerIoBroadcastIds, libraryQuery.data?.broadcasts]);
  const selectedBroadcastNames = broadcasts
    .filter((item) => form.customerIoBroadcastIds.includes(item.id))
    .map((item) => item.name);
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

      <div className="space-y-2">
        <Label htmlFor="customer-io-broadcasts">Broadcasts (optional)</Label>
        {libraryQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading broadcasts…
          </div>
        ) : libraryQuery.isError ? (
          <p className="text-sm text-destructive">Failed to load Customer.io broadcasts.</p>
        ) : (
          <Popover open={broadcastPickerOpen} onOpenChange={setBroadcastPickerOpen}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  disabled={!customerIoConnected || broadcasts.length === 0}
                  className="w-full justify-between font-normal"
                  id="customer-io-broadcasts"
                />
              }
            >
              <span className="truncate text-left">
                {selectedBroadcastNames.length > 0
                  ? selectedBroadcastNames.join(", ")
                  : "All broadcasts"}
              </span>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--anchor-width)] p-0">
              <Command>
                <CommandInput placeholder="Search" />
                <CommandList label="Broadcasts" aria-multiselectable={true}>
                  <CommandEmpty>No items found.</CommandEmpty>
                  <CommandGroup>
                    {broadcasts.map((item) => {
                      const checked = form.customerIoBroadcastIds.includes(item.id);
                      return (
                        <CommandItem
                          key={item.id}
                          value={`${item.id} ${item.name}`}
                          data-checked={checked || undefined}
                          aria-checked={checked}
                          onSelect={() =>
                            onChange({
                              ...form,
                              customerIoBroadcastIds: toggleId(
                                form.customerIoBroadcastIds,
                                item.id,
                              ),
                            })
                          }
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
        <p className="text-xs text-muted-foreground">
          Leave empty to discover every broadcast. Limit by campaign in the skill when needed.
        </p>
      </div>

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
