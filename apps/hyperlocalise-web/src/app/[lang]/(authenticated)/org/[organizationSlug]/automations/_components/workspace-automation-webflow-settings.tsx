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
import { useEffect, useMemo, useRef } from "react";
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
import type {
  WebflowConnectionSummary,
  WebflowDiscoveryResult,
  WebflowLocale,
} from "@/lib/webflow/types";
import { resolveWebflowLocaleKey } from "@/lib/webflow/webflow-locale";

const WEBFLOW_EXISTING_TRANSLATION_POLICY_LABELS = {
  seed_empty: "Only empty locales",
  refresh_imported: "Refresh imported locales",
  overwrite_all: "Overwrite all locales",
} as const;

type WebflowExistingTranslationPolicy = keyof typeof WEBFLOW_EXISTING_TRANSLATION_POLICY_LABELS;

function applyWebflowConnection(
  form: WorkspaceAutomationFormState,
  connection: WebflowConnectionSummary,
  primaryTag: string | null,
): WorkspaceAutomationFormState {
  return {
    ...form,
    webflowConnectionId: connection.id,
    webflowSiteId: connection.siteId,
    webflowCollectionIds: connection.collectionIds.length > 0 ? [...connection.collectionIds] : [],
    webflowSourceLocale: primaryTag ?? form.webflowSourceLocale,
  };
}

export function WorkspaceAutomationWebflowSettings({
  organizationSlug,
  form,
  errors,
  webflowConnected,
  connections,
  projectSourceLocale,
  projectTargetLocales,
  onChange,
}: {
  organizationSlug: string;
  form: WorkspaceAutomationFormState;
  errors: WorkspaceAutomationFieldErrors;
  webflowConnected: boolean;
  connections: WebflowConnectionSummary[];
  projectSourceLocale?: string | null;
  projectTargetLocales?: string[];
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  const intl = useIntl();
  const selectedConnection = connections.find(
    (connection) => connection.id === form.webflowConnectionId,
  );

  const discoverQuery = useQuery({
    queryKey: ["webflow-discover", organizationSlug, form.webflowConnectionId],
    enabled: form.webflowEnabled && webflowConnected && Boolean(form.webflowConnectionId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"][
        "webflow-connections"
      ].discover.$post({
        param: { organizationSlug },
        json: { connectionId: form.webflowConnectionId },
      });
      if (!response.ok) {
        throw new Error("Failed to discover Webflow site");
      }
      const body = await response.json();
      return body.webflowDiscovery as WebflowDiscoveryResult;
    },
  });

  const discovery = discoverQuery.data ?? null;
  const siteLocales = useMemo(() => {
    if (!discovery?.locales) {
      return [];
    }
    return [discovery.locales.primary, ...discovery.locales.secondary];
  }, [discovery]);

  const collections = discovery?.collections ?? [];
  const primaryTag = discovery?.locales?.primary.tag ?? null;

  // Default to every collection: an empty selection is invalid ("Choose at
  // least one Webflow collection"), so pre-check all of them once per
  // connection. The applied key lets the user uncheck everything afterwards
  // without the default fighting back.
  const autoSelectedCollectionsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (collections.length === 0 || form.webflowCollectionIds.length > 0) {
      return;
    }
    const key = `${form.webflowConnectionId ?? ""}|${collections.map((collection) => collection.id).join(",")}`;
    if (autoSelectedCollectionsKeyRef.current === key) {
      return;
    }
    autoSelectedCollectionsKeyRef.current = key;
    onChange({ ...form, webflowCollectionIds: collections.map((collection) => collection.id) });
  }, [collections, form, onChange]);

  useEffect(() => {
    if (!form.webflowEnabled || !webflowConnected || form.webflowConnectionId) {
      return;
    }
    const first = connections[0];
    if (!first) {
      return;
    }
    onChange({ ...form, webflowConnectionId: first.id, webflowSiteId: first.siteId });
  }, [connections, form, onChange, webflowConnected]);

  useEffect(() => {
    if (!selectedConnection || form.webflowSiteId === selectedConnection.siteId) {
      return;
    }
    onChange({ ...form, webflowSiteId: selectedConnection.siteId });
  }, [form, onChange, selectedConnection]);

  useEffect(() => {
    if (!primaryTag || form.webflowSourceLocale === primaryTag) {
      return;
    }
    if (form.webflowSourceLocale.trim().length > 0) {
      return;
    }
    onChange({ ...form, webflowSourceLocale: primaryTag });
  }, [form, onChange, primaryTag]);

  const localeMappingRows = useMemo(() => {
    const secondary: WebflowLocale[] = discovery?.locales?.secondary ?? [];
    const projectSource = projectSourceLocale?.trim() || "";
    const targets = (projectTargetLocales ?? []).filter((locale) => locale.trim().length > 0);
    return [
      ...(projectSource
        ? [
            {
              projectLocale: projectSource,
              webflowLocale: primaryTag
                ? resolveWebflowLocaleKey(projectSource, [
                    ...(discovery?.locales ? [discovery.locales.primary] : []),
                    ...secondary,
                  ])
                : null,
              role: "source" as const,
            },
          ]
        : []),
      ...targets.map((projectLocale) => ({
        projectLocale,
        webflowLocale: resolveWebflowLocaleKey(projectLocale, secondary),
        role: "target" as const,
      })),
    ];
  }, [discovery, primaryTag, projectSourceLocale, projectTargetLocales]);

  function toggleCollection(collectionId: string) {
    const selected = form.webflowCollectionIds.includes(collectionId);
    onChange({
      ...form,
      webflowCollectionIds: selected
        ? form.webflowCollectionIds.filter((id) => id !== collectionId)
        : [...form.webflowCollectionIds, collectionId],
    });
  }

  function toggleTargetLocale(tag: string) {
    const selected = form.webflowTargetLocales.includes(tag);
    onChange({
      ...form,
      webflowTargetLocales: selected
        ? form.webflowTargetLocales.filter((locale) => locale !== tag)
        : [...form.webflowTargetLocales, tag],
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="space-y-2">
        <Label htmlFor="webflow-connection">Connection</Label>
        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Connect Webflow in Integrations first, then pick the site connection to import from.
          </p>
        ) : (
          <Select
            value={form.webflowConnectionId || undefined}
            onValueChange={(connectionId) => {
              if (!connectionId) {
                return;
              }
              const connection = connections.find((entry) => entry.id === connectionId);
              if (!connection) {
                return;
              }
              onChange(applyWebflowConnection(form, connection, primaryTag));
            }}
            disabled={!webflowConnected}
          >
            <SelectTrigger
              id="webflow-connection"
              className="w-full"
              aria-invalid={Boolean(errors.webflowConnectionId)}
            >
              <SelectValue placeholder="Select a Webflow connection">
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
        {errors.webflowConnectionId ? (
          <p data-slot="field-error" className="text-sm text-destructive">
            {errors.webflowConnectionId}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>Collections</Label>
        {!form.webflowConnectionId ? (
          <p className="text-sm text-muted-foreground">Select a connection first.</p>
        ) : discoverQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading collections…
          </div>
        ) : discoverQuery.isError ? (
          <p className="text-sm text-destructive">Failed to load Webflow collections.</p>
        ) : collections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No CMS collections on this site.</p>
        ) : (
          <ul className="space-y-1.5">
            {collections.map((collection) => {
              const checked = form.webflowCollectionIds.includes(collection.id);
              return (
                <li key={collection.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      disabled={!webflowConnected}
                      onCheckedChange={() => toggleCollection(collection.id)}
                    />
                    <span className="truncate">{collection.displayName || collection.slug}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {errors.webflowCollectionIds ? (
          <p data-slot="field-error" className="text-sm text-destructive">
            {errors.webflowCollectionIds}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Choose at least one collection. Only PlainText, RichText, and Option fields are
            imported.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="webflow-source-locale">Webflow source locale</Label>
        <Select
          value={form.webflowSourceLocale || undefined}
          onValueChange={(locale) => {
            if (!locale) {
              return;
            }
            onChange({ ...form, webflowSourceLocale: locale });
          }}
          disabled={!webflowConnected || siteLocales.length === 0}
        >
          <SelectTrigger
            id="webflow-source-locale"
            className="w-full"
            aria-invalid={Boolean(errors.webflowSourceLocale)}
          >
            <SelectValue placeholder="Select a source locale">
              {form.webflowSourceLocale
                ? formatLocaleOptionLabel(intl, form.webflowSourceLocale)
                : "Select a source locale"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {siteLocales.map((locale) => (
              <SelectItem
                key={locale.cmsLocaleId}
                value={locale.tag}
                label={formatLocaleOptionLabel(intl, locale.tag)}
              >
                {formatLocaleOptionLabel(intl, locale.tag)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.webflowSourceLocale ? (
          <p data-slot="field-error" className="text-sm text-destructive">
            {errors.webflowSourceLocale}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            The site primary locale. It must be the same language as the project source locale.
          </p>
        )}
        {localeMappingRows.length > 0 ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {localeMappingRows.map((row) => (
              <li key={`${row.role}-${row.projectLocale}`}>
                {formatLocaleOptionLabel(intl, row.projectLocale)}
                {row.role === "source" ? " (source)" : ""}
                {" → "}
                {row.webflowLocale
                  ? formatLocaleOptionLabel(intl, row.webflowLocale.tag)
                  : "Unmapped, skipped"}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>Target locales (optional)</Label>
        {(discovery?.locales?.secondary ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Secondary locales load after discovery. Leave empty to use every project target that
            maps to an enabled secondary.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {(discovery?.locales?.secondary ?? []).map((locale) => {
              const checked =
                form.webflowTargetLocales.length === 0 ||
                form.webflowTargetLocales.includes(locale.tag);
              return (
                <li key={locale.cmsLocaleId}>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      disabled={!webflowConnected || !locale.enabled}
                      onCheckedChange={() => toggleTargetLocale(locale.tag)}
                    />
                    <span className="truncate">
                      {formatLocaleOptionLabel(intl, locale.tag)}
                      {!locale.enabled ? " (disabled on site)" : ""}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Leave empty to import jobs for every mapped project target. Disabled secondaries are
          always skipped.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="webflow-existing-translation-policy">Existing Webflow translations</Label>
        <Select
          value={form.webflowExistingTranslationPolicy}
          onValueChange={(policy) => {
            const next = policy as WebflowExistingTranslationPolicy;
            if (next !== "seed_empty" && next !== "refresh_imported" && next !== "overwrite_all") {
              return;
            }
            onChange({ ...form, webflowExistingTranslationPolicy: next });
          }}
        >
          <SelectTrigger id="webflow-existing-translation-policy" className="w-full">
            <SelectValue>
              {WEBFLOW_EXISTING_TRANSLATION_POLICY_LABELS[form.webflowExistingTranslationPolicy]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(
              Object.entries(WEBFLOW_EXISTING_TRANSLATION_POLICY_LABELS) as Array<
                [WebflowExistingTranslationPolicy, string]
              >
            ).map(([policy, label]) => (
              <SelectItem key={policy} value={policy} label={label}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          When a secondary locale already has content, import it into the project. The default never
          overwrites work already in Hyperlocalise.
        </p>
      </div>
    </div>
  );
}
