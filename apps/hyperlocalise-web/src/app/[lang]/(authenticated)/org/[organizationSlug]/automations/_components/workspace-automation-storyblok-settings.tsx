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
import { resolveStoryblokLanguage } from "@/lib/storyblok/storyblok-locale";
import type { StoryblokConnectionSummary, StoryblokDiscoveryResult } from "@/lib/storyblok/types";

const STORYBLOK_EXISTING_TRANSLATION_POLICY_LABELS = {
  seed_empty: "Only empty locales",
  refresh_imported: "Refresh imported locales",
  overwrite_all: "Overwrite all locales",
} as const;

type StoryblokExistingTranslationPolicy = keyof typeof STORYBLOK_EXISTING_TRANSLATION_POLICY_LABELS;

export function WorkspaceAutomationStoryblokSettings({
  organizationSlug,
  form,
  errors,
  storyblokConnected,
  connections,
  projectTargetLocales,
  onChange,
}: {
  organizationSlug: string;
  form: WorkspaceAutomationFormState;
  errors: WorkspaceAutomationFieldErrors;
  storyblokConnected: boolean;
  connections: StoryblokConnectionSummary[];
  projectTargetLocales?: string[];
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  const intl = useIntl();
  const selectedConnection = connections.find(
    (connection) => connection.id === form.storyblokConnectionId,
  );

  const discoverQuery = useQuery({
    queryKey: [
      "storyblok-discover",
      organizationSlug,
      form.storyblokConnectionId,
      selectedConnection?.spaceId,
    ],
    enabled: form.storyblokEnabled && storyblokConnected && Boolean(selectedConnection),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"][
        "storyblok-connections"
      ].discover.$post({
        param: { organizationSlug },
        json: {
          connectionId: form.storyblokConnectionId,
          spaceId: selectedConnection?.spaceId,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to load the Storyblok space");
      }
      const body = await response.json();
      return body.storyblokDiscovery as StoryblokDiscoveryResult;
    },
  });

  const discovery = discoverQuery.data ?? null;
  const folders = discovery?.folders ?? [];
  const languages = useMemo(() => discovery?.space?.languages ?? [], [discovery]);

  useEffect(() => {
    if (!form.storyblokEnabled || !storyblokConnected || form.storyblokConnectionId) {
      return;
    }
    const first = connections[0];
    if (!first) {
      return;
    }
    onChange({ ...form, storyblokConnectionId: first.id });
  }, [connections, form, onChange, storyblokConnected]);

  const localeMappingRows = useMemo(
    () =>
      (projectTargetLocales ?? [])
        .filter((locale) => locale.trim().length > 0)
        .map((projectLocale) => ({
          projectLocale,
          language: resolveStoryblokLanguage(projectLocale, languages),
        })),
    [languages, projectTargetLocales],
  );

  function toggleFolder(fullSlug: string) {
    const selected = form.storyblokFolderSlugs.includes(fullSlug);
    onChange({
      ...form,
      storyblokFolderSlugs: selected
        ? form.storyblokFolderSlugs.filter((slug) => slug !== fullSlug)
        : [...form.storyblokFolderSlugs, fullSlug],
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="space-y-2">
        <Label htmlFor="storyblok-connection">Connection</Label>
        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Connect Storyblok in Integrations first, then pick the space to import from.
          </p>
        ) : (
          <Select
            value={form.storyblokConnectionId || undefined}
            onValueChange={(connectionId) => {
              if (!connectionId) {
                return;
              }
              onChange({ ...form, storyblokConnectionId: connectionId, storyblokFolderSlugs: [] });
            }}
            disabled={!storyblokConnected}
          >
            <SelectTrigger
              id="storyblok-connection"
              className="w-full"
              aria-invalid={Boolean(errors.storyblokConnectionId)}
            >
              <SelectValue placeholder="Select a Storyblok connection">
                {selectedConnection?.displayName}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {connections.map((connection) => (
                <SelectItem
                  key={connection.id}
                  value={connection.id}
                  label={connection.displayName}
                >
                  {connection.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {errors.storyblokConnectionId ? (
          <p data-slot="field-error" className="text-sm text-destructive">
            {errors.storyblokConnectionId}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>Folders</Label>
        {!selectedConnection ? (
          <p className="text-sm text-muted-foreground">Select a connection first.</p>
        ) : discoverQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading folders…
          </div>
        ) : discoverQuery.isError ? (
          <p className="text-sm text-destructive">Failed to load the Storyblok space.</p>
        ) : folders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This space has no folders. Every story is imported.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {folders.map((folder) => (
              <li key={folder.id}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.storyblokFolderSlugs.includes(folder.fullSlug)}
                    disabled={!storyblokConnected}
                    onCheckedChange={() => toggleFolder(folder.fullSlug)}
                  />
                  <span className="truncate">
                    {folder.name} <span className="text-muted-foreground">({folder.fullSlug})</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Leave all unticked to use the connection's folders, or every story when the connection has
          none. Only fields marked Translatable in Storyblok are imported.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Languages</Label>
        {!selectedConnection ? (
          <p className="text-sm text-muted-foreground">Select a connection first.</p>
        ) : discoverQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading languages…
          </div>
        ) : languages.length === 0 ? (
          <p className="text-sm text-destructive">
            This space has no translation languages. Add them in Storyblok under Settings →
            Internationalization.
          </p>
        ) : localeMappingRows.length > 0 ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {localeMappingRows.map((row) => (
              <li key={row.projectLocale}>
                {formatLocaleOptionLabel(intl, row.projectLocale)}
                {" → "}
                {row.language
                  ? `${row.language.name || row.language.code} (${row.language.code})`
                  : "No matching Storyblok language, skipped"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Pick a project with target languages to see how they map.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          The space's default language is the source. It should be the project's source language.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="storyblok-existing-translation-policy">
          Existing Storyblok translations
        </Label>
        <Select
          value={form.storyblokExistingTranslationPolicy}
          onValueChange={(policy) => {
            const next = policy as StoryblokExistingTranslationPolicy;
            if (next !== "seed_empty" && next !== "refresh_imported" && next !== "overwrite_all") {
              return;
            }
            onChange({ ...form, storyblokExistingTranslationPolicy: next });
          }}
        >
          <SelectTrigger id="storyblok-existing-translation-policy" className="w-full">
            <SelectValue>
              {
                STORYBLOK_EXISTING_TRANSLATION_POLICY_LABELS[
                  form.storyblokExistingTranslationPolicy
                ]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(
              Object.entries(STORYBLOK_EXISTING_TRANSLATION_POLICY_LABELS) as Array<
                [StoryblokExistingTranslationPolicy, string]
              >
            ).map(([policy, label]) => (
              <SelectItem key={policy} value={policy} label={label}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          When a language already has translations in Storyblok, import them into the project. The
          default never overwrites work already in Hyperlocalise.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Push writes approved translations onto each story as field-level translations. It doesn't
        publish the story.
      </p>
    </div>
  );
}
