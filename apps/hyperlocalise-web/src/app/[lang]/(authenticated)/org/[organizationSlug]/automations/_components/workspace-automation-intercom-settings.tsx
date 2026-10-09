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
import { useEffect, useMemo, useState } from "react";
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
import type { WorkspaceAutomationFieldErrors } from "@/lib/agents/workspace-automation-view-model";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";
import { formatLocaleOptionLabel } from "@/lib/i18n/locale-display-names.messages";
import type {
  IntercomCollectionSummary,
  IntercomHelpCenterSummary,
} from "@/lib/intercom/articles-api";
import { intercomRestEndpointLabel, isIntercomRestEndpoint } from "@/lib/intercom/constants";
import { resolveIntercomLocaleKey } from "@/lib/intercom/intercom-locale";

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

function resolveIntercomFormLocales(input: {
  helpCenterLocales: readonly string[];
  collectionLocales: readonly string[];
  sourceLocale: string;
}): string[] {
  if (input.helpCenterLocales.length > 0) {
    return [...input.helpCenterLocales];
  }
  if (input.collectionLocales.length > 0) {
    return [...input.collectionLocales];
  }
  const sourceLocale = input.sourceLocale.trim();
  return sourceLocale ? [sourceLocale] : [];
}

function applyIntercomHelpCenter(
  form: WorkspaceAutomationFormState,
  center: IntercomHelpCenterSummary,
): WorkspaceAutomationFormState {
  const nextSourceLocale = center.defaultLocale?.trim() || form.intercomSourceLocale.trim() || "en";
  return {
    ...form,
    intercomHelpCenterId: center.id,
    intercomHelpCenterLocales: resolveIntercomFormLocales({
      helpCenterLocales: center.locales ?? [],
      collectionLocales: [],
      sourceLocale: nextSourceLocale,
    }),
    intercomSourceLocale: nextSourceLocale,
    intercomCollectionIds: [],
  };
}

export function WorkspaceAutomationIntercomSettings({
  organizationSlug,
  form,
  errors,
  intercomConnected,
  projectSourceLocale,
  projectTargetLocales,
  onChange,
}: {
  organizationSlug: string;
  form: WorkspaceAutomationFormState;
  errors: WorkspaceAutomationFieldErrors;
  intercomConnected: boolean;
  projectSourceLocale?: string | null;
  projectTargetLocales?: string[];
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  const intl = useIntl();
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const helpCentersQuery = useQuery({
    queryKey: ["intercom-help-centers", organizationSlug],
    enabled: form.intercomEnabled && intercomConnected,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].intercom["help-centers"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load Intercom help centers");
      }
      const body = await response.json();
      if (!("helpCenters" in body) || !Array.isArray(body.helpCenters)) {
        throw new Error("Failed to load Intercom help centers");
      }
      return {
        restEndpoint:
          "restEndpoint" in body && isIntercomRestEndpoint(body.restEndpoint)
            ? body.restEndpoint
            : null,
        helpCenters: body.helpCenters as IntercomHelpCenterSummary[],
      };
    },
  });

  const collectionsQuery = useQuery({
    queryKey: ["intercom-collections", organizationSlug, form.intercomHelpCenterId],
    enabled: form.intercomEnabled && intercomConnected && Boolean(form.intercomHelpCenterId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].intercom["help-centers"][
        ":helpCenterId"
      ].collections.$get({
        param: { organizationSlug, helpCenterId: form.intercomHelpCenterId },
      });
      if (!response.ok) {
        throw new Error("Failed to load Intercom collections");
      }
      const body = await response.json();
      if (!("collections" in body) || !Array.isArray(body.collections)) {
        throw new Error("Failed to load Intercom collections");
      }
      return body.collections as IntercomCollectionSummary[];
    },
  });

  const helpCenters = helpCentersQuery.data?.helpCenters ?? [];
  const selectedHelpCenter = helpCenters.find(
    (center) => String(center.id) === String(form.intercomHelpCenterId),
  );
  const connectedRestEndpoint = helpCentersQuery.data?.restEndpoint;
  const collections = useMemo(() => {
    const loaded = collectionsQuery.data ?? [];
    const byId = new Map(loaded.map((collection) => [collection.id, collection]));
    const extras = form.intercomCollectionIds
      .filter((id) => !byId.has(id))
      .map((id) => ({
        id,
        name: `Collection ${id}`,
        helpCenterId: form.intercomHelpCenterId,
        locales: [],
      }));
    return [...loaded, ...extras];
  }, [collectionsQuery.data, form.intercomCollectionIds, form.intercomHelpCenterId]);
  const selectedCollectionNames = collections
    .filter((collection) => form.intercomCollectionIds.includes(collection.id))
    .map((collection) => collection.name);
  const sourceLocaleOptions = useMemo(
    () =>
      uniqueLocales([
        ...form.intercomHelpCenterLocales,
        ...(selectedHelpCenter?.locales ?? []),
        selectedHelpCenter?.defaultLocale,
        ...(collectionsQuery.data ?? []).flatMap((collection) => collection.locales),
        form.intercomSourceLocale,
      ]),
    [
      collectionsQuery.data,
      form.intercomHelpCenterLocales,
      form.intercomSourceLocale,
      selectedHelpCenter,
    ],
  );
  const localeMappingRows = useMemo(() => {
    const intercomLocales = sourceLocaleOptions;
    const projectSource = projectSourceLocale?.trim() || "";
    const targets = (projectTargetLocales ?? []).filter((locale) => locale.trim().length > 0);
    const rows = [
      ...(projectSource
        ? [
            {
              projectLocale: projectSource,
              intercomLocale:
                resolveIntercomLocaleKey(
                  form.intercomSourceLocale || projectSource,
                  intercomLocales,
                ) ?? resolveIntercomLocaleKey(projectSource, intercomLocales),
              role: "source" as const,
            },
          ]
        : []),
      ...targets.map((projectLocale) => ({
        projectLocale,
        intercomLocale: resolveIntercomLocaleKey(projectLocale, intercomLocales),
        role: "target" as const,
      })),
    ];
    return rows;
  }, [form.intercomSourceLocale, projectSourceLocale, projectTargetLocales, sourceLocaleOptions]);

  useEffect(() => {
    if (!connectedRestEndpoint || connectedRestEndpoint === form.intercomRestEndpoint) {
      return;
    }
    onChange({
      ...form,
      intercomRestEndpoint: connectedRestEndpoint,
    });
  }, [connectedRestEndpoint, form, form.intercomRestEndpoint, onChange]);

  useEffect(() => {
    if (!form.intercomEnabled || !intercomConnected || form.intercomHelpCenterId.trim()) {
      return;
    }
    const firstHelpCenter = helpCenters[0];
    if (!firstHelpCenter) {
      return;
    }
    onChange(applyIntercomHelpCenter(form, firstHelpCenter));
  }, [form, helpCenters, intercomConnected, onChange]);

  useEffect(() => {
    if (!form.intercomHelpCenterId) {
      return;
    }

    const nextLocales = resolveIntercomFormLocales({
      helpCenterLocales: selectedHelpCenter?.locales ?? [],
      collectionLocales: uniqueLocales(
        (collectionsQuery.data ?? []).flatMap((collection) => collection.locales),
      ),
      sourceLocale: selectedHelpCenter?.defaultLocale || form.intercomSourceLocale,
    });
    if (nextLocales.length === 0) {
      return;
    }

    const localesUnchanged =
      nextLocales.length === form.intercomHelpCenterLocales.length &&
      nextLocales.every((locale) => form.intercomHelpCenterLocales.includes(locale));
    const currentSourceLocale = form.intercomSourceLocale.trim();
    const nextSourceLocale = nextLocales.includes(currentSourceLocale)
      ? currentSourceLocale
      : selectedHelpCenter?.defaultLocale?.trim() || nextLocales[0] || currentSourceLocale;
    if (localesUnchanged && nextSourceLocale === form.intercomSourceLocale) {
      return;
    }

    onChange({
      ...form,
      intercomHelpCenterLocales: [...nextLocales],
      intercomSourceLocale: nextSourceLocale,
    });
  }, [collectionsQuery.data, form, selectedHelpCenter, onChange]);

  function toggleCollection(collectionId: string) {
    const selected = form.intercomCollectionIds.includes(collectionId);
    onChange({
      ...form,
      intercomCollectionIds: selected
        ? form.intercomCollectionIds.filter((id) => id !== collectionId)
        : [...form.intercomCollectionIds, collectionId],
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      {connectedRestEndpoint ? (
        <p className="text-xs text-muted-foreground">
          Connected region: {intercomRestEndpointLabel(connectedRestEndpoint)}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="intercom-help-center">Help Center</Label>
        {helpCentersQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading help centers…
          </div>
        ) : helpCentersQuery.isError ? (
          <p className="text-sm text-destructive">Failed to load Intercom help centers.</p>
        ) : (
          <Select
            value={form.intercomHelpCenterId || undefined}
            onValueChange={(helpCenterId) => {
              if (!helpCenterId) {
                return;
              }
              const center = helpCenters.find((item) => String(item.id) === String(helpCenterId));
              if (!center) {
                return;
              }
              onChange(applyIntercomHelpCenter(form, center));
            }}
            disabled={!intercomConnected || helpCenters.length === 0}
          >
            <SelectTrigger
              id="intercom-help-center"
              className="w-full"
              aria-invalid={Boolean(errors.intercomHelpCenterId)}
            >
              <SelectValue placeholder="Select a help center">
                {selectedHelpCenter?.displayName ?? form.intercomHelpCenterId}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {helpCenters.map((center) => (
                <SelectItem
                  key={center.id}
                  value={center.id}
                  label={center.displayName || center.id}
                >
                  {center.displayName || center.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {errors.intercomHelpCenterId ? (
          <p data-slot="field-error" className="text-sm text-destructive">
            {errors.intercomHelpCenterId}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="intercom-source-locale">Intercom source locale</Label>
        <Select
          value={form.intercomSourceLocale || undefined}
          onValueChange={(locale) => {
            if (!locale) {
              return;
            }
            onChange({ ...form, intercomSourceLocale: locale });
          }}
          disabled={!intercomConnected || sourceLocaleOptions.length === 0}
        >
          <SelectTrigger
            id="intercom-source-locale"
            className="w-full"
            aria-invalid={Boolean(errors.intercomSourceLocale)}
          >
            <SelectValue placeholder="Select a source locale">
              {form.intercomSourceLocale
                ? formatLocaleOptionLabel(intl, form.intercomSourceLocale)
                : "Select a source locale"}
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
        {errors.intercomSourceLocale ? (
          <p data-slot="field-error" className="text-sm text-destructive">
            {errors.intercomSourceLocale}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            The Help Center language for original article copy. It must be the same language as the
            project source, for example English (United States) maps to English (en).
          </p>
        )}
        {localeMappingRows.length > 0 ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {localeMappingRows.map((row) => (
              <li key={`${row.role}-${row.projectLocale}`}>
                {formatLocaleOptionLabel(intl, row.projectLocale)}
                {row.role === "source" ? " (source)" : ""}
                {" → "}
                {row.intercomLocale
                  ? formatLocaleOptionLabel(intl, row.intercomLocale)
                  : "Unmapped, skipped"}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="intercom-collections">Collections (optional)</Label>
        {!form.intercomHelpCenterId ? (
          <p className="text-sm text-muted-foreground">Select a help center first.</p>
        ) : collectionsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading collections…
          </div>
        ) : collectionsQuery.isError ? (
          <p className="text-sm text-destructive">Failed to load Intercom collections.</p>
        ) : (
          <Popover open={collectionPickerOpen} onOpenChange={setCollectionPickerOpen}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  disabled={!intercomConnected || collections.length === 0}
                  className="w-full justify-between font-normal"
                  id="intercom-collections"
                />
              }
            >
              <span className="truncate text-left">
                {selectedCollectionNames.length > 0
                  ? selectedCollectionNames.join(", ")
                  : "All collections"}
              </span>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--anchor-width)] p-0">
              <Command>
                <CommandInput placeholder="Search collections" />
                <CommandList label="Collections" aria-multiselectable={true}>
                  <CommandEmpty>No collections found.</CommandEmpty>
                  <CommandGroup>
                    {collections.map((collection) => {
                      const checked = form.intercomCollectionIds.includes(collection.id);
                      return (
                        <CommandItem
                          key={collection.id}
                          value={`${collection.id} ${collection.name}`}
                          data-checked={checked || undefined}
                          aria-checked={checked}
                          onSelect={() => toggleCollection(collection.id)}
                        >
                          <span className="truncate">{collection.name}</span>
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
          Leave empty to import every collection in the Help Center.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.intercomIncludeDrafts}
          onCheckedChange={(checked) =>
            onChange({ ...form, intercomIncludeDrafts: checked === true })
          }
        />
        Include draft articles on import
      </label>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.intercomOverwriteIntercomDrafts}
          onCheckedChange={(checked) =>
            onChange({ ...form, intercomOverwriteIntercomDrafts: checked === true })
          }
        />
        Overwrite Intercom drafts when remote target is newer (when enabled)
      </label>
    </div>
  );
}
