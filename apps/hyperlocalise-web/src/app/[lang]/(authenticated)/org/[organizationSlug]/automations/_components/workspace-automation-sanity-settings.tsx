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
import { useIntl } from "react-intl";

import { Checkbox } from "@/components/ui/checkbox";
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
import type { SanityExistingTranslationPolicy } from "@/lib/sanity/existing-translation-policy";
import { resolveSanityLocaleKey } from "@/lib/sanity/sanity-locale";
import type { SanityDocumentTypeSummary, SanityManageProject } from "@/lib/sanity/types";

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

  const typeNamesQuery = useQuery({
    queryKey: ["sanity-type-names", organizationSlug, form.sanityProjectId, form.sanityDataset],
    enabled:
      form.sanityEnabled &&
      sanityConnected &&
      Boolean(form.sanityProjectId) &&
      Boolean(form.sanityDataset),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].sanity.projects[
        ":projectId"
      ].datasets[":dataset"].types.$get({
        param: {
          organizationSlug,
          projectId: form.sanityProjectId,
          dataset: form.sanityDataset,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to load Sanity document types");
      }
      const body = await response.json();
      return (body.typeNames ?? []) as string[];
    },
  });

  const documentTypesQuery = useQuery({
    queryKey: [
      "sanity-document-types",
      organizationSlug,
      form.sanityProjectId,
      form.sanityDataset,
      form.sanityDocumentTypes.join(","),
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
        },
      });
      if (!response.ok) {
        throw new Error("Failed to inspect Sanity document types");
      }
      const body = await response.json();
      return {
        types: (body.types ?? []) as SanityDocumentTypeSummary[],
        languages: (body.languages ?? []) as string[],
      };
    },
  });

  const languageOptions = useMemo(
    () =>
      uniqueLocales([
        ...form.sanityLanguages,
        ...(documentTypesQuery.data?.languages ?? []),
        form.sanitySourceLocale,
        ...form.sanityTargetLocales,
      ]),
    [
      documentTypesQuery.data?.languages,
      form.sanityLanguages,
      form.sanitySourceLocale,
      form.sanityTargetLocales,
    ],
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
                resolveSanityLocaleKey(form.sanitySourceLocale || projectSource, sanityLocales) ??
                resolveSanityLocaleKey(projectSource, sanityLocales),
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
  }, [form.sanitySourceLocale, languageOptions, projectSourceLocale, projectTargetLocales]);

  useEffect(() => {
    if (!form.sanityEnabled || !sanityConnected) {
      return;
    }
    const languages = documentTypesQuery.data?.languages ?? [];
    if (languages.length === 0) {
      return;
    }
    const unchanged =
      languages.length === form.sanityLanguages.length &&
      languages.every((locale) => form.sanityLanguages.includes(locale));
    if (unchanged) {
      return;
    }
    onChange({
      ...form,
      sanityLanguages: [...languages],
      sanitySourceLocale: languages.includes(form.sanitySourceLocale)
        ? form.sanitySourceLocale
        : (languages[0] ?? form.sanitySourceLocale),
    });
  }, [documentTypesQuery.data?.languages, form, onChange, sanityConnected]);

  function toggleDocumentType(typeName: string) {
    const selected = form.sanityDocumentTypes.includes(typeName);
    onChange({
      ...form,
      sanityDocumentTypes: selected
        ? form.sanityDocumentTypes.filter((entry) => entry !== typeName)
        : [...form.sanityDocumentTypes, typeName],
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
                sanityLanguages: [],
              });
            }}
          >
            <SelectTrigger id="sanity-project">
              <SelectValue placeholder="Choose a project" />
            </SelectTrigger>
            <SelectContent>
              {(projectsQuery.data ?? []).map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.displayName}
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
                sanityLanguages: [],
              });
            }}
            disabled={!form.sanityProjectId}
          >
            <SelectTrigger id="sanity-dataset">
              <SelectValue placeholder="Choose a dataset" />
            </SelectTrigger>
            <SelectContent>
              {(datasetsQuery.data ?? []).map((dataset) => (
                <SelectItem key={dataset.name} value={dataset.name}>
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
        <Label>Document types</Label>
        {typeNamesQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading document types…
          </div>
        ) : (
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border p-3">
            {(typeNamesQuery.data ?? []).map((typeName) => (
              <label key={typeName} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.sanityDocumentTypes.includes(typeName)}
                  onCheckedChange={() => toggleDocumentType(typeName)}
                />
                {typeName}
              </label>
            ))}
          </div>
        )}
        {errors.sanityDocumentTypes ? (
          <p className="text-sm text-destructive">{errors.sanityDocumentTypes}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="sanity-source-locale">Sanity source locale</Label>
        <Select
          value={form.sanitySourceLocale}
          onValueChange={(sanitySourceLocale) => {
            if (!sanitySourceLocale) {
              return;
            }
            onChange({ ...form, sanitySourceLocale });
          }}
          disabled={languageOptions.length === 0}
        >
          <SelectTrigger id="sanity-source-locale">
            <SelectValue placeholder="Choose source locale" />
          </SelectTrigger>
          <SelectContent>
            {languageOptions.map((locale) => (
              <SelectItem key={locale} value={locale}>
                {formatLocaleOptionLabel(intl, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.sanitySourceLocale ? (
          <p className="text-sm text-destructive">{errors.sanitySourceLocale}</p>
        ) : null}
      </div>

      {localeMappingRows.length > 0 ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">Locale mapping</p>
          <ul className="space-y-1 text-muted-foreground">
            {localeMappingRows.map((row) => (
              <li key={`${row.role}-${row.projectLocale}`}>
                {row.projectLocale} → {row.sanityLocale ?? "unmapped"} ({row.role})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
          <SelectTrigger id="sanity-existing-translation-policy">
            <SelectValue />
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
