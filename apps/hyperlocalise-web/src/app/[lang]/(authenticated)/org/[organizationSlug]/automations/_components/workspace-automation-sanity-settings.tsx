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
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useIntl, type IntlShape } from "react-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
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
import { canonicalizeLocale } from "@/lib/i18n/locales";
import type { SanityExistingTranslationPolicy } from "@/lib/sanity/existing-translation-policy";
import {
  filterTranslatableSanityDocumentTypes,
  isSanityDocumentTypeLocalizable,
  sanityDocumentI18nModeLabel,
  sanityDocumentTypeTitle,
} from "@/lib/sanity/localization-mode";
import { isSanityLocaleSupportedForDocumentType } from "@/lib/sanity/locale-catalog";
import { pickSanitySourceLocale, resolveSanityLocaleKey } from "@/lib/sanity/sanity-locale";
import type {
  SanityDocumentTypeSummary,
  SanityLocaleCatalogEntry,
  SanityLocaleSource,
  SanityManageProject,
} from "@/lib/sanity/types";

const SANITY_EXISTING_TRANSLATION_POLICY_LABELS: Record<SanityExistingTranslationPolicy, string> = {
  seed_empty: "Only empty locales",
  refresh_imported: "Refresh imported locales",
  overwrite_all: "Overwrite all locales",
};

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

function sanityLocaleCatalogQuery(form: WorkspaceAutomationFormState) {
  return {
    localeType: form.sanityLocaleCatalogDocumentType.trim() || "locale",
    tagField: form.sanityLocaleCatalogTagField.trim() || "tag",
    titleField: form.sanityLocaleCatalogTitleField.trim() || "name",
  };
}

function formatSanityLocaleLabel(
  intl: IntlShape,
  tag: string,
  titleByTag: ReadonlyMap<string, string>,
): string {
  const studioTitle = titleByTag.get(tag)?.trim();
  const normalizedTag = canonicalizeLocale(tag) ?? tag;
  if (studioTitle && studioTitle !== tag && studioTitle !== normalizedTag) {
    return `${studioTitle} (${normalizedTag})`;
  }
  return formatLocaleOptionLabel(intl, tag);
}

function localeSourceDescription(source: SanityLocaleSource, localeCount: number): string {
  if (source === "catalog") {
    const label = localeCount === 1 ? "locale" : "locales";
    return `From Locales collection (${localeCount} ${label}).`;
  }
  if (source === "inferred") {
    return "Inferred from content. Add a Locales collection in Studio for an exact list.";
  }
  return "No locales found.";
}

export function WorkspaceAutomationSanitySettings({
  organizationSlug,
  form,
  errors,
  sanityConnected,
  projectSourceLocale,
  projectTargetLocales,
  onChange,
}: {
  organizationSlug: string;
  form: WorkspaceAutomationFormState;
  errors: WorkspaceAutomationFieldErrors;
  sanityConnected: boolean;
  projectSourceLocale?: string | null;
  projectTargetLocales?: string[];
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  const intl = useIntl();

  const projectsQuery = useQuery({
    queryKey: ["sanity-projects", organizationSlug],
    enabled: form.sanityEnabled && sanityConnected,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].sanity.projects.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load Sanity projects");
      }
      const body = await response.json();
      return (body.projects ?? []) as SanityManageProject[];
    },
  });

  const projects = projectsQuery.data ?? [];
  const selectedProject = projects.find((project) => project.id === form.sanityProjectId);

  useEffect(() => {
    if (!form.sanityEnabled || !sanityConnected || form.sanityProjectId.trim()) {
      return;
    }
    const firstProject = projects[0];
    if (!firstProject) {
      return;
    }
    onChange({
      ...form,
      sanityProjectId: firstProject.id,
      sanityDataset: "",
      sanityDocumentTypes: [],
      sanityDocumentTypeModes: {},
      sanityLanguages: [],
      sanityTargetLocales: [],
    });
  }, [form, onChange, projects, sanityConnected]);

  const datasetsQuery = useQuery({
    queryKey: ["sanity-datasets", organizationSlug, form.sanityProjectId],
    enabled: form.sanityEnabled && sanityConnected && Boolean(form.sanityProjectId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].sanity.projects[
        ":projectId"
      ].datasets.$get({
        param: { organizationSlug, projectId: form.sanityProjectId },
      });
      if (!response.ok) {
        throw new Error("Failed to load Sanity datasets");
      }
      const body = await response.json();
      return (body.datasets ?? []) as Array<{ name: string }>;
    },
  });

  const translatableDocumentTypesQuery = useQuery({
    queryKey: [
      "sanity-translatable-document-types",
      organizationSlug,
      form.sanityProjectId,
      form.sanityDataset,
    ],
    enabled:
      form.sanityEnabled &&
      sanityConnected &&
      Boolean(form.sanityProjectId) &&
      Boolean(form.sanityDataset),
    queryFn: async () => {
      const typesResponse = await apiClient.api.orgs[":organizationSlug"].sanity.projects[
        ":projectId"
      ].datasets[":dataset"].types.$get({
        param: {
          organizationSlug,
          projectId: form.sanityProjectId,
          dataset: form.sanityDataset,
        },
      });
      if (!typesResponse.ok) {
        throw new Error("Failed to load Sanity document types");
      }
      const typeNames = ((await typesResponse.json()).typeNames ?? []) as string[];
      if (typeNames.length === 0) {
        return [] as SanityDocumentTypeSummary[];
      }

      const detectedResponse = await apiClient.api.orgs[":organizationSlug"].sanity.projects[
        ":projectId"
      ].datasets[":dataset"]["document-types"].$get({
        param: {
          organizationSlug,
          projectId: form.sanityProjectId,
          dataset: form.sanityDataset,
        },
        query: {
          typeNames: typeNames.join(","),
        },
      });
      if (!detectedResponse.ok) {
        throw new Error("Failed to inspect Sanity document types");
      }
      const body = await detectedResponse.json();
      const types = ((body.types ?? []) as SanityDocumentTypeSummary[]).map((type) => ({
        ...type,
        title: type.title || sanityDocumentTypeTitle(type.name),
      }));
      return filterTranslatableSanityDocumentTypes(types);
    },
  });

  const translatableDocumentTypes = translatableDocumentTypesQuery.data ?? [];
  const translatableTypeNames = useMemo(
    () => new Set(translatableDocumentTypes.map((type) => type.name)),
    [translatableDocumentTypes],
  );

  const localeCatalogQuery = sanityLocaleCatalogQuery(form);

  const sanityLocalesQuery = useQuery({
    queryKey: [
      "sanity-locales",
      organizationSlug,
      form.sanityProjectId,
      form.sanityDataset,
      localeCatalogQuery.localeType,
      localeCatalogQuery.tagField,
      localeCatalogQuery.titleField,
    ],
    enabled:
      form.sanityEnabled &&
      sanityConnected &&
      Boolean(form.sanityProjectId) &&
      Boolean(form.sanityDataset),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].sanity.projects[
        ":projectId"
      ].datasets[":dataset"].locales.$get({
        param: {
          organizationSlug,
          projectId: form.sanityProjectId,
          dataset: form.sanityDataset,
        },
        query: localeCatalogQuery,
      });
      if (!response.ok) {
        throw new Error("Failed to load Sanity locales");
      }
      const body = await response.json();
      return {
        locales: (body.locales ?? []) as SanityLocaleCatalogEntry[],
        languages: (body.languages ?? []) as string[],
        source: (body.source === "catalog" ? "catalog" : "none") as SanityLocaleSource,
      };
    },
  });

  const documentTypesQuery = useQuery({
    queryKey: [
      "sanity-document-types",
      organizationSlug,
      form.sanityProjectId,
      form.sanityDataset,
      form.sanityDocumentTypes.join(","),
      form.sanitySourceLocale,
      localeCatalogQuery.localeType,
      localeCatalogQuery.tagField,
      localeCatalogQuery.titleField,
    ],
    enabled:
      form.sanityEnabled &&
      sanityConnected &&
      Boolean(form.sanityProjectId) &&
      Boolean(form.sanityDataset) &&
      form.sanityDocumentTypes.length > 0,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].sanity.projects[
        ":projectId"
      ].datasets[":dataset"]["document-types"].$get({
        param: {
          organizationSlug,
          projectId: form.sanityProjectId,
          dataset: form.sanityDataset,
        },
        query: {
          typeNames: form.sanityDocumentTypes.join(","),
          sourceLocale: form.sanitySourceLocale.trim() || undefined,
          ...localeCatalogQuery,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to inspect Sanity document types");
      }
      const body = await response.json();
      return {
        types: (body.types ?? []) as SanityDocumentTypeSummary[],
        languages: (body.languages ?? []) as string[],
        localeSource: (body.localeSource ?? "none") as SanityLocaleSource,
        unsupportedSourceTypes: (body.unsupportedSourceTypes ?? []) as string[],
      };
    },
  });

  const localeTitleByTag = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of sanityLocalesQuery.data?.locales ?? []) {
      map.set(entry.tag, entry.title);
    }
    return map;
  }, [sanityLocalesQuery.data?.locales]);

  const sanityLocaleCatalog = useMemo(() => {
    const fromLocalesCollection = uniqueLocales(sanityLocalesQuery.data?.languages ?? []);
    if (fromLocalesCollection.length > 0) {
      return fromLocalesCollection;
    }
    return uniqueLocales(documentTypesQuery.data?.languages ?? []);
  }, [documentTypesQuery.data?.languages, sanityLocalesQuery.data?.languages]);

  const resolvedLocaleSource = useMemo((): SanityLocaleSource => {
    if (sanityLocalesQuery.data?.source === "catalog") {
      return "catalog";
    }
    if (documentTypesQuery.data?.localeSource === "inferred") {
      return "inferred";
    }
    if (sanityLocaleCatalog.length > 0) {
      return "inferred";
    }
    return "none";
  }, [
    documentTypesQuery.data?.localeSource,
    sanityLocalesQuery.data?.source,
    sanityLocaleCatalog.length,
  ]);

  const resolvedSanityLanguages = sanityLocaleCatalog;

  const languageOptions = sanityLocaleCatalog;

  const selectedSanitySourceLocale = useMemo(
    () =>
      pickSanitySourceLocale({
        catalog: sanityLocaleCatalog,
        currentSourceLocale: form.sanitySourceLocale,
        projectSourceLocale,
      }),
    [form.sanitySourceLocale, projectSourceLocale, sanityLocaleCatalog],
  );

  const localeMappingRows = useMemo(() => {
    const sanityLocales = languageOptions;
    const projectSource = projectSourceLocale?.trim() || "";
    const targets = (projectTargetLocales ?? []).filter((locale) => locale.trim().length > 0);
    return [
      ...(projectSource
        ? [
            {
              projectLocale: projectSource,
              sanityLocale:
                resolveSanityLocaleKey(
                  selectedSanitySourceLocale || projectSource,
                  sanityLocales,
                ) ?? resolveSanityLocaleKey(projectSource, sanityLocales),
              role: "source" as const,
            },
          ]
        : []),
      ...targets.map((projectLocale) => ({
        projectLocale,
        sanityLocale: resolveSanityLocaleKey(projectLocale, sanityLocales),
        role: "target" as const,
      })),
    ];
  }, [languageOptions, projectSourceLocale, projectTargetLocales, selectedSanitySourceLocale]);

  function unsupportedTypesForSanityLocale(sanityLocale: string | null | undefined): string[] {
    if (!sanityLocale) {
      return [];
    }
    return form.sanityDocumentTypes.filter(
      (typeName) =>
        !isSanityLocaleSupportedForDocumentType({
          sanityLocale,
          documentType: typeName,
          languagesByType: form.sanityLanguagesByType,
          fallbackLanguages: languageOptions,
        }),
    );
  }

  useEffect(() => {
    if (!form.sanityEnabled || !sanityConnected || sanityLocaleCatalog.length === 0) {
      return;
    }
    if (selectedSanitySourceLocale === form.sanitySourceLocale) {
      return;
    }
    onChange({
      ...form,
      sanitySourceLocale: selectedSanitySourceLocale,
    });
  }, [form, onChange, sanityConnected, sanityLocaleCatalog.length, selectedSanitySourceLocale]);

  useEffect(() => {
    if (!form.sanityEnabled || !sanityConnected) {
      return;
    }
    const languages = resolvedSanityLanguages;
    if (languages.length === 0) {
      return;
    }
    const nextLanguagesByType = Object.fromEntries(
      (documentTypesQuery.data?.types ?? [])
        .filter((type) => type.languages.length > 0)
        .map((type) => [type.name, type.languages]),
    );
    const languagesUnchanged =
      languages.length === form.sanityLanguages.length &&
      languages.every((locale) => form.sanityLanguages.includes(locale));
    const languagesByTypeUnchanged =
      Object.keys(nextLanguagesByType).length === Object.keys(form.sanityLanguagesByType).length &&
      Object.entries(nextLanguagesByType).every(
        ([typeName, typeLanguages]) =>
          form.sanityLanguagesByType[typeName]?.length === typeLanguages.length &&
          typeLanguages.every((locale) => form.sanityLanguagesByType[typeName]?.includes(locale)),
      );
    if (languagesUnchanged && languagesByTypeUnchanged) {
      if (form.sanityTargetLocales.length === 0) {
        return;
      }
      onChange({
        ...form,
        sanityTargetLocales: [],
      });
      return;
    }
    onChange({
      ...form,
      sanityLanguages: [...languages],
      sanityLanguagesByType: nextLanguagesByType,
      sanitySourceLocale: pickSanitySourceLocale({
        catalog: languages,
        currentSourceLocale: form.sanitySourceLocale,
        projectSourceLocale,
      }),
      sanityTargetLocales: [],
    });
  }, [
    documentTypesQuery.data?.types,
    form,
    onChange,
    projectSourceLocale,
    resolvedSanityLanguages,
    sanityConnected,
  ]);

  useEffect(() => {
    if (translatableDocumentTypesQuery.isLoading || translatableTypeNames.size === 0) {
      return;
    }
    const pruned = form.sanityDocumentTypes.filter((name) => translatableTypeNames.has(name));
    if (pruned.length === form.sanityDocumentTypes.length) {
      return;
    }
    const nextModes = { ...form.sanityDocumentTypeModes };
    for (const name of Object.keys(nextModes)) {
      if (!pruned.includes(name)) {
        delete nextModes[name];
      }
    }
    onChange({
      ...form,
      sanityDocumentTypes: pruned,
      sanityDocumentTypeModes: nextModes,
      sanityTargetLocales: [],
      ...(pruned.length === 0 ? { sanityLanguages: [], sanityLanguagesByType: {} } : {}),
    });
  }, [form, onChange, translatableDocumentTypesQuery.isLoading, translatableTypeNames]);

  const selectedDocumentTypes = useMemo(
    () => translatableDocumentTypes.filter((type) => form.sanityDocumentTypes.includes(type.name)),
    [form.sanityDocumentTypes, translatableDocumentTypes],
  );

  function setSelectedDocumentTypes(nextTypes: SanityDocumentTypeSummary[]) {
    const nextNames = nextTypes.map((type) => type.name);
    const nextModes: Record<string, "document" | "field"> = {};
    for (const type of nextTypes) {
      if (isSanityDocumentTypeLocalizable(type.i18nMode)) {
        nextModes[type.name] = type.i18nMode;
      }
    }
    onChange({
      ...form,
      sanityDocumentTypes: nextNames,
      sanityDocumentTypeModes: nextModes,
      sanityTargetLocales: [],
      ...(nextNames.length === 0 ? { sanityLanguages: [], sanityLanguagesByType: {} } : {}),
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="space-y-2">
        <Label htmlFor="sanity-project">Sanity project</Label>
        {projectsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading projects…
          </div>
        ) : (
          <Select
            value={form.sanityProjectId || undefined}
            onValueChange={(projectId) => {
              if (!projectId) {
                return;
              }
              onChange({
                ...form,
                sanityProjectId: projectId,
                sanityDataset: "",
                sanityDocumentTypes: [],
                sanityDocumentTypeModes: {},
                sanityLanguages: [],
                sanityTargetLocales: [],
              });
            }}
          >
            <SelectTrigger id="sanity-project" className="w-full">
              <SelectValue placeholder="Choose a project">
                {selectedProject?.displayName ?? form.sanityProjectId}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem
                  key={project.id}
                  value={project.id}
                  label={project.displayName || project.id}
                >
                  {project.displayName || project.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {errors.sanityProjectId ? (
          <p className="text-sm text-destructive">{errors.sanityProjectId}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="sanity-dataset">Dataset</Label>
        {datasetsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading datasets…
          </div>
        ) : (
          <Select
            value={form.sanityDataset || undefined}
            onValueChange={(dataset) => {
              if (!dataset) {
                return;
              }
              onChange({
                ...form,
                sanityDataset: dataset,
                sanityDocumentTypes: [],
                sanityDocumentTypeModes: {},
                sanityLanguages: [],
                sanityTargetLocales: [],
              });
            }}
            disabled={!form.sanityProjectId}
          >
            <SelectTrigger id="sanity-dataset" className="w-full">
              <SelectValue placeholder="Choose a dataset">
                {form.sanityDataset || undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(datasetsQuery.data ?? []).map((dataset) => (
                <SelectItem key={dataset.name} value={dataset.name} label={dataset.name}>
                  {dataset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {errors.sanityDataset ? (
          <p className="text-sm text-destructive">{errors.sanityDataset}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="sanity-document-types">Document types</Label>
        {!form.sanityDataset ? (
          <p className="text-sm text-muted-foreground">Select a dataset first.</p>
        ) : translatableDocumentTypesQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading translatable document types…
          </div>
        ) : translatableDocumentTypesQuery.isError ? (
          <p className="text-sm text-destructive">Failed to load document types.</p>
        ) : translatableDocumentTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No translatable document types found. Configure document- or field-level i18n in your
            Sanity schema.
          </p>
        ) : (
          <Combobox
            items={translatableDocumentTypes}
            multiple
            value={selectedDocumentTypes}
            onValueChange={setSelectedDocumentTypes}
            itemToStringValue={(type) =>
              `${type.title} ${type.name} ${sanityDocumentI18nModeLabel(type.i18nMode)}`
            }
            disabled={!sanityConnected}
          >
            <ComboboxChips
              id="sanity-document-types"
              className="w-full"
              aria-invalid={Boolean(errors.sanityDocumentTypes) || undefined}
            >
              <ComboboxValue>
                {selectedDocumentTypes.map((type) => (
                  <ComboboxChip key={type.name}>{type.title}</ComboboxChip>
                ))}
              </ComboboxValue>
              <ComboboxChipsInput placeholder="Search document types" />
            </ComboboxChips>
            <ComboboxContent>
              <ComboboxEmpty>No matching document types.</ComboboxEmpty>
              <ComboboxList>
                {(type) => (
                  <ComboboxItem key={type.name} value={type}>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="block truncate">{type.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {sanityDocumentI18nModeLabel(type.i18nMode)}
                      </span>
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        )}
        {errors.sanityDocumentTypes ? (
          <p className="text-sm text-destructive">{errors.sanityDocumentTypes}</p>
        ) : form.sanityDataset ? (
          <p className="text-xs text-muted-foreground">
            Only types with document- or field-level i18n in this dataset. Studio can list more that
            are not localized.
          </p>
        ) : null}
      </div>

      <Collapsible className="space-y-2 rounded-lg border border-border p-3">
        <CollapsibleTrigger className="flex w-full items-center justify-between text-left text-sm font-medium">
          Advanced: locale catalog
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          <div className="space-y-2">
            <Label htmlFor="sanity-locale-document-type">Locale document type</Label>
            <Input
              id="sanity-locale-document-type"
              value={form.sanityLocaleCatalogDocumentType}
              onChange={(event) =>
                onChange({ ...form, sanityLocaleCatalogDocumentType: event.target.value })
              }
              placeholder="locale"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sanity-locale-tag-field">Tag field</Label>
            <Input
              id="sanity-locale-tag-field"
              value={form.sanityLocaleCatalogTagField}
              onChange={(event) =>
                onChange({ ...form, sanityLocaleCatalogTagField: event.target.value })
              }
              placeholder="tag"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sanity-locale-title-field">Title field</Label>
            <Input
              id="sanity-locale-title-field"
              value={form.sanityLocaleCatalogTitleField}
              onChange={(event) =>
                onChange({ ...form, sanityLocaleCatalogTitleField: event.target.value })
              }
              placeholder="name"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Defaults match Sanity&apos;s recommended <code className="text-xs">locale</code>{" "}
            documents. Change these only when your Studio uses different type or field names.
          </p>
        </CollapsibleContent>
      </Collapsible>

      <div className="space-y-2">
        <Label htmlFor="sanity-source-locale">Sanity source locale</Label>
        <Select
          value={selectedSanitySourceLocale || undefined}
          onValueChange={(sanitySourceLocale) => {
            if (!sanitySourceLocale) {
              return;
            }
            onChange({ ...form, sanitySourceLocale });
          }}
          disabled={
            !form.sanityDataset ||
            languageOptions.length === 0 ||
            sanityLocalesQuery.isLoading ||
            !sanityConnected
          }
        >
          <SelectTrigger
            id="sanity-source-locale"
            className="w-full"
            aria-invalid={Boolean(errors.sanitySourceLocale)}
          >
            <SelectValue placeholder="Choose source locale">
              {selectedSanitySourceLocale
                ? formatSanityLocaleLabel(intl, selectedSanitySourceLocale, localeTitleByTag)
                : "Choose source locale"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {languageOptions.map((locale) => (
              <SelectItem
                key={locale}
                value={locale}
                label={formatSanityLocaleLabel(intl, locale, localeTitleByTag)}
              >
                {formatSanityLocaleLabel(intl, locale, localeTitleByTag)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.sanitySourceLocale ? (
          <p data-slot="field-error" className="text-sm text-destructive">
            {errors.sanitySourceLocale}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {localeSourceDescription(resolvedLocaleSource, languageOptions.length)}
          </p>
        )}
        {!errors.sanitySourceLocale ? (
          <p className="text-xs text-muted-foreground">
            The Sanity language for original copy. It must be the same language as the project
            source, for example English (United States) maps to English (en).
          </p>
        ) : null}
        {localeMappingRows.length > 0 ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {localeMappingRows.map((row) => {
              const unsupportedTypes = unsupportedTypesForSanityLocale(row.sanityLocale);
              return (
                <li key={`${row.role}-${row.projectLocale}`}>
                  {formatLocaleOptionLabel(intl, row.projectLocale)}
                  {row.role === "source" ? " (source)" : ""}
                  {" → "}
                  {row.sanityLocale
                    ? formatSanityLocaleLabel(intl, row.sanityLocale, localeTitleByTag)
                    : "Unmapped, skipped"}
                  {unsupportedTypes.length > 0
                    ? ` (not on ${unsupportedTypes.map((typeName) => sanityDocumentTypeTitle(typeName)).join(", ")})`
                    : ""}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.sanityIncludeDrafts}
          onCheckedChange={(checked) =>
            onChange({ ...form, sanityIncludeDrafts: checked === true })
          }
        />
        Include draft documents on import
      </label>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.sanityOverwriteSanityDrafts}
          onCheckedChange={(checked) =>
            onChange({ ...form, sanityOverwriteSanityDrafts: checked === true })
          }
        />
        Overwrite Sanity drafts when remote target is newer
      </label>

      <div className="space-y-2">
        <Label htmlFor="sanity-existing-translation-policy">Existing Sanity translations</Label>
        <Select
          value={form.sanityExistingTranslationPolicy}
          onValueChange={(sanityExistingTranslationPolicy) =>
            onChange({
              ...form,
              sanityExistingTranslationPolicy:
                sanityExistingTranslationPolicy as SanityExistingTranslationPolicy,
            })
          }
        >
          <SelectTrigger id="sanity-existing-translation-policy" className="w-full">
            <SelectValue>
              {SANITY_EXISTING_TRANSLATION_POLICY_LABELS[form.sanityExistingTranslationPolicy]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(
              Object.keys(
                SANITY_EXISTING_TRANSLATION_POLICY_LABELS,
              ) as SanityExistingTranslationPolicy[]
            ).map((policy) => (
              <SelectItem key={policy} value={policy}>
                {SANITY_EXISTING_TRANSLATION_POLICY_LABELS[policy]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
