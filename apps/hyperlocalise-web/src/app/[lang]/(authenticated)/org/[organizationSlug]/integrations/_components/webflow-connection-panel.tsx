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
import { useEffect, useId, useMemo, useState } from "react";
import { EyeIcon, EyeSlashIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createApiClient } from "@/lib/api-client";
import { resolveWorkspaceIntegrationSummary } from "@/lib/integrations/workspace-integrations";
import { WEBFLOW_PIPES_SLUG } from "@/lib/webflow/constants";

import { IntegrationLogo } from "./integration-logo";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { CollapsibleIntegrationRow } from "./integration-row";
import { webflowConnectionPanelMessages } from "./webflow-connection-panel.messages";

const api = createApiClient();

export type WebflowConnectionSummary = {
  id: string;
  displayName: string;
  siteId: string;
  collectionIds: string[];
  validationStatus: string;
  validationMessage: string | null;
  maskedTokenSuffix: string | null;
};

type WebflowDiscovery = {
  sites: Array<{ id: string; displayName: string }>;
  site: {
    id: string;
    displayName: string;
    locales: {
      primary: { tag: string; cmsLocaleId: string };
      secondary: Array<{ tag: string; cmsLocaleId: string; enabled: boolean }>;
    };
  } | null;
  collections: Array<{ id: string; displayName: string; slug: string }>;
};

export function useWebflowConnections(organizationSlug: string) {
  const intl = useIntl();
  return useQuery({
    queryKey: ["webflow-connections", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["webflow-connections"].$get({
        param: { organizationSlug },
      });
      if (!res.ok) {
        throw new Error(intl.formatMessage(webflowConnectionPanelMessages.fetchConnectionsFailed));
      }
      const data = await res.json();
      return data.webflowConnections as WebflowConnectionSummary[];
    },
  });
}

export function WebflowConnectionPanel({
  organizationSlug,
  disabled,
  isLast = false,
}: {
  organizationSlug: string;
  disabled?: boolean;
  isLast?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const displayNameId = useId();
  const siteTokenId = useId();
  const [expanded, setExpanded] = useState(false);
  const [displayName, setDisplayName] = useState("Webflow");
  const [siteToken, setSiteToken] = useState("");
  const [showSiteToken, setShowSiteToken] = useState(false);
  const [siteId, setSiteId] = useState("");
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [discovery, setDiscovery] = useState<WebflowDiscovery | null>(null);

  const summary = useMemo(
    () => resolveWorkspaceIntegrationSummary(intl, WEBFLOW_PIPES_SLUG),
    [intl],
  );
  const providerName = summary?.name ?? "Webflow";

  const connectionsQuery = useWebflowConnections(organizationSlug);
  const connection = connectionsQuery.data?.[0] ?? null;
  const isConnected = Boolean(connection && connection.validationStatus === "valid");

  useEffect(() => {
    if (!connection) {
      return;
    }
    setDisplayName(connection.displayName);
    setSiteId(connection.siteId);
    setCollectionIds(connection.collectionIds ?? []);
  }, [connection]);

  const discoverMutation = useMutation({
    mutationFn: async () => {
      const trimmedToken = siteToken.trim();
      const res = await api.api.orgs[":organizationSlug"]["webflow-connections"].discover.$post({
        param: { organizationSlug },
        json: {
          siteToken: trimmedToken || undefined,
          connectionId: trimmedToken ? undefined : connection?.id,
          siteId: siteId.trim() || undefined,
        },
      });
      if (!res.ok) {
        throw new Error(intl.formatMessage(webflowConnectionPanelMessages.discoverFailed));
      }
      const body = await res.json();
      return body.webflowDiscovery as WebflowDiscovery;
    },
    onSuccess: (result) => {
      setDiscovery(result);
      if (!siteId && result.site?.id) {
        setSiteId(result.site.id);
      }
      if (!displayName.trim() && result.site?.displayName) {
        setDisplayName(result.site.displayName);
      }
      if (!connection) {
        setCollectionIds(result.collections.map((collection) => collection.id));
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Discover failed");
    },
  });

  const readSaveError = async (res: Response): Promise<never> => {
    const body: unknown = await res.json().catch(() => null);
    const record =
      typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
    if (record?.error === "workspace_resource_limit_reached") {
      throw new Error(
        typeof record.message === "string" && record.message.length > 0
          ? record.message
          : intl.formatMessage(webflowConnectionPanelMessages.saveLimitReached),
      );
    }
    throw new Error(intl.formatMessage(webflowConnectionPanelMessages.saveFailed));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = siteToken.trim();
      if (!connection && !token) {
        throw new Error("Site token is required");
      }
      if (!siteId.trim()) {
        throw new Error("Choose a site");
      }

      const payload = {
        displayName: displayName.trim() || "Webflow",
        siteId: siteId.trim(),
        collectionIds,
        siteToken: token,
      };

      if (connection) {
        const res = await api.api.orgs[":organizationSlug"]["webflow-connections"][
          ":connectionId"
        ].$patch({
          param: { organizationSlug, connectionId: connection.id },
          json: {
            displayName: payload.displayName,
            siteId: payload.siteId,
            collectionIds: payload.collectionIds,
            ...(token ? { siteToken: token } : {}),
          },
        });
        if (!res.ok) {
          return readSaveError(res);
        }
        return res.json();
      }

      const res = await api.api.orgs[":organizationSlug"]["webflow-connections"].$post({
        param: { organizationSlug },
        json: { ...payload, siteToken: token, enabled: true },
      });
      if (!res.ok) {
        return readSaveError(res);
      }
      return res.json();
    },
    onSuccess: async () => {
      setSiteToken("");
      await queryClient.invalidateQueries({ queryKey: ["webflow-connections", organizationSlug] });
      toast.success(intl.formatMessage(webflowConnectionPanelMessages.saveSuccess));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Save failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!connection) {
        return;
      }
      const res = await api.api.orgs[":organizationSlug"]["webflow-connections"][
        ":connectionId"
      ].$delete({
        param: { organizationSlug, connectionId: connection.id },
      });
      if (!res.ok) {
        throw new Error(intl.formatMessage(webflowConnectionPanelMessages.deleteFailed));
      }
    },
    onSuccess: async () => {
      setDiscovery(null);
      setCollectionIds([]);
      await queryClient.invalidateQueries({ queryKey: ["webflow-connections", organizationSlug] });
      toast.success(intl.formatMessage(webflowConnectionPanelMessages.deleteSuccess));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    },
  });

  const collections = discovery?.collections ?? [];
  const sites = discovery?.sites ?? [];
  const canSave = discovery !== null;
  const localeTags = discovery?.site?.locales
    ? [
        discovery.site.locales.primary.tag,
        ...discovery.site.locales.secondary.filter((l) => l.enabled).map((l) => l.tag),
      ]
    : [];

  return (
    <CollapsibleIntegrationRow
      name={providerName}
      description={summary?.detail ?? ""}
      icon={
        summary?.logoSrc ? (
          <IntegrationLogo src={summary.logoSrc} muted={!isConnected} />
        ) : summary?.icon ? (
          <SimpleBrandIcon icon={summary.icon} colored={isConnected} />
        ) : null
      }
      isConnected={isConnected}
      userIsAdmin={!disabled}
      expanded={expanded}
      onExpandedChange={setExpanded}
      isLoading={connectionsQuery.isLoading}
      isLast={isLast}
    >
      <div className="flex flex-col gap-4 p-4 pt-0">
        {connection?.validationStatus === "invalid" && connection.validationMessage ? (
          <Badge variant="destructive">{connection.validationMessage}</Badge>
        ) : null}
        {connection?.maskedTokenSuffix ? (
          <p className="text-muted-foreground text-sm">Token {connection.maskedTokenSuffix}</p>
        ) : null}
        {localeTags.length > 0 ? (
          <p className="text-muted-foreground text-sm">Locales: {localeTags.join(", ")}</p>
        ) : null}

        <Field>
          <FieldLabel htmlFor={displayNameId}>
            <FormattedMessage {...webflowConnectionPanelMessages.displayNameLabel} />
          </FieldLabel>
          <Input
            id={displayNameId}
            value={displayName}
            disabled={disabled}
            onChange={(event) => setDisplayName(event.currentTarget.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={siteTokenId}>
            <FormattedMessage {...webflowConnectionPanelMessages.siteTokenLabel} />
          </FieldLabel>
          <FieldDescription>
            <FormattedMessage {...webflowConnectionPanelMessages.siteTokenDescription} />
          </FieldDescription>
          <div className="flex gap-2">
            <Input
              id={siteTokenId}
              type={showSiteToken ? "text" : "password"}
              value={siteToken}
              disabled={disabled}
              autoComplete="off"
              onChange={(event) => {
                setSiteToken(event.currentTarget.value);
                setDiscovery(null);
              }}
              placeholder={connection ? "Leave blank to keep current token" : undefined}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              onClick={() => setShowSiteToken((current) => !current)}
            >
              {showSiteToken ? <EyeSlashIcon /> : <EyeIcon />}
            </Button>
          </div>
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || discoverMutation.isPending}
            onClick={() => discoverMutation.mutate()}
          >
            <FormattedMessage {...webflowConnectionPanelMessages.testDiscover} />
          </Button>
        </div>

        {sites.length > 0 ? (
          <Field>
            <FieldLabel>
              <FormattedMessage {...webflowConnectionPanelMessages.siteLabel} />
            </FieldLabel>
            <Select
              value={siteId}
              disabled={disabled}
              onValueChange={(value) => {
                if (!value) {
                  return;
                }
                setSiteId(value);
                setCollectionIds([]);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select site">
                  {sites.find((site) => site.id === siteId)?.displayName}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {collections.length > 0 ? (
          <Field>
            <FieldLabel>
              <FormattedMessage {...webflowConnectionPanelMessages.collectionsLabel} />
            </FieldLabel>
            <div className="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-md border p-3">
              {collections.map((collection) => {
                const checked = collectionIds.includes(collection.id);
                return (
                  <label key={collection.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(next) => {
                        setCollectionIds((current) =>
                          next === true
                            ? [...current, collection.id]
                            : current.filter((id) => id !== collection.id),
                        );
                      }}
                    />
                    <span>
                      {collection.displayName}{" "}
                      <span className="text-muted-foreground">({collection.slug})</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Field>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {canSave ? (
            <Button
              type="button"
              disabled={disabled || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              <FloppyDiskIcon />
              <FormattedMessage {...webflowConnectionPanelMessages.saveConnection} />
            </Button>
          ) : null}
          {connection ? (
            <Button
              type="button"
              variant="outline"
              disabled={disabled || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              <FormattedMessage {...webflowConnectionPanelMessages.disconnect} />
            </Button>
          ) : null}
        </div>
      </div>
    </CollapsibleIntegrationRow>
  );
}
