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
import type { BrazeExistingTranslationPolicy } from "@/lib/braze/existing-translation-policy";
import { formatLocaleOptionLabel } from "@/lib/i18n/locale-display-names.messages";

const BRAZE_EXISTING_TRANSLATION_POLICY_LABELS: Record<BrazeExistingTranslationPolicy, string> = {
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

export function WorkspaceAutomationBrazeSettings({
  organizationSlug,
  form,
  errors,
  brazeConnected,
  projectSourceLocale,
  projectTargetLocales,
  onChange,
}: {
  organizationSlug: string;
  form: WorkspaceAutomationFormState;
  errors: WorkspaceAutomationFieldErrors;
  brazeConnected: boolean;
  projectSourceLocale?: string | null;
  projectTargetLocales?: string[];
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  const intl = useIntl();
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [blockPickerOpen, setBlockPickerOpen] = useState(false);
  const libraryQuery = useQuery({
    queryKey: ["braze-library", organizationSlug, form.projectId],
    enabled: form.brazeEnabled && brazeConnected,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].braze.library.$get({
        param: { organizationSlug },
        query: form.projectId ? { projectId: form.projectId } : {},
      });
      if (!response.ok) {
        throw new Error("Failed to load Braze library");
      }
      const body = await response.json();
      if (!("templates" in body) || !Array.isArray(body.templates)) {
        throw new Error("Failed to load Braze library");
      }
      return {
        templates: body.templates as LibraryItem[],
        contentBlocks: ("contentBlocks" in body ? body.contentBlocks : []) as LibraryItem[],
      };
    },
  });

  const templates = useMemo(() => {
    const loaded = libraryQuery.data?.templates ?? [];
    const byId = new Map(loaded.map((item) => [item.id, item]));
    const extras = form.brazeTemplateIds
      .filter((id) => !byId.has(id))
      .map((id) => ({ id, name: id }));
    return [...loaded, ...extras];
  }, [form.brazeTemplateIds, libraryQuery.data?.templates]);
  const contentBlocks = useMemo(() => {
    const loaded = libraryQuery.data?.contentBlocks ?? [];
    const byId = new Map(loaded.map((item) => [item.id, item]));
    const extras = form.brazeContentBlockIds
      .filter((id) => !byId.has(id))
      .map((id) => ({ id, name: id }));
    return [...loaded, ...extras];
  }, [form.brazeContentBlockIds, libraryQuery.data?.contentBlocks]);
  const selectedTemplateNames = templates
    .filter((item) => form.brazeTemplateIds.includes(item.id))
    .map((item) => item.name);
  const selectedBlockNames = contentBlocks
    .filter((item) => form.brazeContentBlockIds.includes(item.id))
    .map((item) => item.name);
  const sourceLocaleOptions = uniqueLocales([
    projectSourceLocale,
    form.brazeSourceLocale,
    ...(projectTargetLocales ?? []),
  ]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="braze-source-locale">Source locale</Label>
        <Select
          value={form.brazeSourceLocale}
          onValueChange={(locale) => {
            if (typeof locale === "string") {
              onChange({ ...form, brazeSourceLocale: locale });
            }
          }}
        >
          <SelectTrigger id="braze-source-locale" className="w-full">
            <SelectValue>
              {form.brazeSourceLocale
                ? formatLocaleOptionLabel(intl, form.brazeSourceLocale)
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
        {errors.brazeSourceLocale ? (
          <p className="text-sm text-destructive">{errors.brazeSourceLocale}</p>
        ) : null}
      </div>

      <LibraryPicker
        id="braze-templates"
        label="Email templates (optional)"
        hint="Leave empty to import every template that is not a locale copy."
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        connected={brazeConnected}
        loading={libraryQuery.isLoading}
        error={libraryQuery.isError}
        items={templates}
        selectedIds={form.brazeTemplateIds}
        selectedNames={selectedTemplateNames}
        emptyLabel="All email templates"
        onToggle={(id) =>
          onChange({ ...form, brazeTemplateIds: toggleId(form.brazeTemplateIds, id) })
        }
      />

      <LibraryPicker
        id="braze-content-blocks"
        label="Content Blocks (optional)"
        hint="Leave empty to import every Content Block that is not a locale copy."
        open={blockPickerOpen}
        onOpenChange={setBlockPickerOpen}
        connected={brazeConnected}
        loading={libraryQuery.isLoading}
        error={libraryQuery.isError}
        items={contentBlocks}
        selectedIds={form.brazeContentBlockIds}
        selectedNames={selectedBlockNames}
        emptyLabel="All Content Blocks"
        onToggle={(id) =>
          onChange({ ...form, brazeContentBlockIds: toggleId(form.brazeContentBlockIds, id) })
        }
      />

      <div className="space-y-2">
        <Label htmlFor="braze-existing-translation-policy">Existing Braze translations</Label>
        <Select
          value={form.brazeExistingTranslationPolicy}
          onValueChange={(policy) => {
            if (
              policy !== "seed_empty" &&
              policy !== "refresh_imported" &&
              policy !== "overwrite_all"
            ) {
              return;
            }
            onChange({ ...form, brazeExistingTranslationPolicy: policy });
          }}
        >
          <SelectTrigger id="braze-existing-translation-policy" className="w-full">
            <SelectValue>
              {BRAZE_EXISTING_TRANSLATION_POLICY_LABELS[form.brazeExistingTranslationPolicy]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(
              Object.entries(BRAZE_EXISTING_TRANSLATION_POLICY_LABELS) as Array<
                [BrazeExistingTranslationPolicy, string]
              >
            ).map(([policy, label]) => (
              <SelectItem key={policy} value={policy} label={label}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          When a locale-suffixed Braze copy already exists, import it into the project. The default
          never overwrites work already in Hyperlocalise.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.brazeOverwriteWhenRemoteNewer}
          onCheckedChange={(checked) =>
            onChange({ ...form, brazeOverwriteWhenRemoteNewer: checked === true })
          }
        />
        Overwrite Braze copies when the remote copy is newer
      </label>
    </div>
  );
}

function LibraryPicker({
  id,
  label,
  hint,
  open,
  onOpenChange,
  connected,
  loading,
  error,
  items,
  selectedIds,
  selectedNames,
  emptyLabel,
  onToggle,
}: {
  id: string;
  label: string;
  hint: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connected: boolean;
  loading: boolean;
  error: boolean;
  items: LibraryItem[];
  selectedIds: string[];
  selectedNames: string[];
  emptyLabel: string;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading library…
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">Failed to load Braze library.</p>
      ) : (
        <Popover open={open} onOpenChange={onOpenChange}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                disabled={!connected || items.length === 0}
                className="w-full justify-between font-normal"
                id={id}
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
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
