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
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
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
import type { IterableExistingTranslationPolicy } from "@/lib/iterable/existing-translation-policy";
import { formatLocaleOptionLabel } from "@/lib/i18n/locale-display-names.messages";

import { workspaceAutomationFormMessages } from "./workspace-automation-form.messages";

const ITERABLE_EXISTING_TRANSLATION_POLICY_LABELS: Record<
  IterableExistingTranslationPolicy,
  string
> = {
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

export function WorkspaceAutomationIterableSettings({
  organizationSlug,
  form,
  errors,
  iterableConnected,
  projectSourceLocale,
  projectTargetLocales,
  onChange,
}: {
  organizationSlug: string;
  form: WorkspaceAutomationFormState;
  errors: WorkspaceAutomationFieldErrors;
  iterableConnected: boolean;
  projectSourceLocale?: string | null;
  projectTargetLocales?: string[];
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  const intl = useIntl();
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [blockPickerOpen, setBlockPickerOpen] = useState(false);
  const libraryQuery = useQuery({
    queryKey: ["iterable-library", organizationSlug, form.projectId],
    enabled: form.iterableEnabled && iterableConnected,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].iterable.library.$get({
        param: { organizationSlug },
        query: form.projectId ? { projectId: form.projectId } : {},
      });
      if (!response.ok) {
        throw new Error("Failed to load Iterable library");
      }
      const body = await response.json();
      if (!("templates" in body) || !Array.isArray(body.templates)) {
        throw new Error("Failed to load Iterable library");
      }
      return {
        templates: body.templates as LibraryItem[],
        snippets: ("snippets" in body ? body.snippets : []) as LibraryItem[],
      };
    },
  });

  const templates = useMemo(() => {
    const loaded = libraryQuery.data?.templates ?? [];
    const byId = new Map(loaded.map((item) => [item.id, item]));
    const extras = form.iterableTemplateIds
      .filter((id) => !byId.has(id))
      .map((id) => ({ id, name: id }));
    return [...loaded, ...extras];
  }, [form.iterableTemplateIds, libraryQuery.data?.templates]);
  const snippets = useMemo(() => {
    const loaded = libraryQuery.data?.snippets ?? [];
    const byId = new Map(loaded.map((item) => [item.id, item]));
    const extras = form.iterableSnippetIds
      .filter((id) => !byId.has(id))
      .map((id) => ({ id, name: id }));
    return [...loaded, ...extras];
  }, [form.iterableSnippetIds, libraryQuery.data?.snippets]);
  const selectedTemplateNames = templates
    .filter((item) => form.iterableTemplateIds.includes(item.id))
    .map((item) => item.name);
  const selectedBlockNames = snippets
    .filter((item) => form.iterableSnippetIds.includes(item.id))
    .map((item) => item.name);
  const hasProject = form.projectId.trim().length > 0;
  const sourceLocaleOptions = uniqueLocales([
    projectSourceLocale,
    form.iterableSourceLocale,
    ...(projectTargetLocales ?? []),
  ]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="iterable-source-locale">Source locale</Label>
        {hasProject ? (
          <Select
            value={form.iterableSourceLocale}
            onValueChange={(locale) => {
              if (typeof locale === "string") {
                onChange({ ...form, iterableSourceLocale: locale });
              }
            }}
          >
            <SelectTrigger id="iterable-source-locale" className="w-full">
              <SelectValue>
                {form.iterableSourceLocale
                  ? formatLocaleOptionLabel(intl, form.iterableSourceLocale)
                  : "Choose a source locale"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sourceLocaleOptions.map((locale) => (
                <SelectItem
                  key={locale}
                  value={locale}
                  label={formatLocaleOptionLabel(intl, locale)}
                >
                  {formatLocaleOptionLabel(intl, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground">
            <FormattedMessage
              {...workspaceAutomationFormMessages.chooseProjectForIterableSourceLocale}
            />
          </p>
        )}
        {hasProject && errors.iterableSourceLocale ? (
          <p className="text-sm text-destructive">{errors.iterableSourceLocale}</p>
        ) : null}
      </div>

      <LibraryPicker
        id="iterable-templates"
        label="Templates (optional)"
        hint="Leave empty to import every template that is not a locale copy."
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        connected={iterableConnected}
        loading={libraryQuery.isLoading}
        error={libraryQuery.isError}
        items={templates}
        selectedIds={form.iterableTemplateIds}
        selectedNames={selectedTemplateNames}
        emptyLabel="All templates"
        onToggle={(id) =>
          onChange({ ...form, iterableTemplateIds: toggleId(form.iterableTemplateIds, id) })
        }
      />

      <LibraryPicker
        id="iterable-content-blocks"
        label="Snippets (optional)"
        hint="Leave empty to import every snippet that is not a locale suffix copy."
        open={blockPickerOpen}
        onOpenChange={setBlockPickerOpen}
        connected={iterableConnected}
        loading={libraryQuery.isLoading}
        error={libraryQuery.isError}
        items={snippets}
        selectedIds={form.iterableSnippetIds}
        selectedNames={selectedBlockNames}
        emptyLabel="All Snippets"
        onToggle={(id) =>
          onChange({ ...form, iterableSnippetIds: toggleId(form.iterableSnippetIds, id) })
        }
      />

      <div className="space-y-2">
        <Label htmlFor="iterable-existing-translation-policy">Existing Iterable translations</Label>
        <Select
          value={form.iterableExistingTranslationPolicy}
          onValueChange={(policy) => {
            if (
              policy !== "seed_empty" &&
              policy !== "refresh_imported" &&
              policy !== "overwrite_all"
            ) {
              return;
            }
            onChange({ ...form, iterableExistingTranslationPolicy: policy });
          }}
        >
          <SelectTrigger id="iterable-existing-translation-policy" className="w-full">
            <SelectValue>
              {ITERABLE_EXISTING_TRANSLATION_POLICY_LABELS[form.iterableExistingTranslationPolicy]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(
              Object.entries(ITERABLE_EXISTING_TRANSLATION_POLICY_LABELS) as Array<
                [IterableExistingTranslationPolicy, string]
              >
            ).map(([policy, label]) => (
              <SelectItem key={policy} value={policy} label={label}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          When a locale-suffixed Iterable copy already exists, import it into the project. The
          default never overwrites work already in Hyperlocalise.
        </p>
      </div>
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
        <p className="text-sm text-destructive">Failed to load Iterable library.</p>
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
