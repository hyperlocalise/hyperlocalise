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

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createApiClient } from "@/lib/api-client";
import {
  ITERABLE_PIPES_SLUG,
  ITERABLE_REGIONS,
  iterableRegionOptionLabel,
  isIterableRegion,
  type IterableRegion,
} from "@/lib/iterable/constants";
import { resolveWorkspaceIntegrationSummary } from "@/lib/integrations/workspace-integrations";

import { iterableConnectionPanelMessages } from "./iterable-connection-panel.messages";
import { IntegrationLogo } from "./integration-logo";
import { CollapsibleIntegrationRow } from "./integration-row";
import { pipesConnectionPanelMessages } from "./pipes-connection-panel.messages";
import { usePipesStatus } from "./pipes-connection-panel";

const api = createApiClient();

export function IterableConnectionPanel({
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
  const apiKeyFieldId = useId();
  const regionFieldId = useId();
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<IterableRegion | null>(null);
  const statusQuery = usePipesStatus(organizationSlug, ITERABLE_PIPES_SLUG, expanded);
  const summary = useMemo(
    () => resolveWorkspaceIntegrationSummary(intl, ITERABLE_PIPES_SLUG),
    [intl],
  );
  const providerName = summary?.name ?? "Iterable";
  const userCanManage = !disabled;
  const isConnected = Boolean(statusQuery.data?.connected);
  const needsReauthorization = Boolean(statusQuery.data?.needsReauthorization);
  const apiKeyLast4 = statusQuery.data?.apiKeyLast4 ?? null;

  const settingsQuery = useQuery({
    queryKey: ["iterable", organizationSlug],
    enabled: expanded && isConnected,
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["iterable"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(iterableConnectionPanelMessages.loadFailed));
      }
      const body = await response.json();
      const region =
        "iterable" in body &&
        body.iterable &&
        typeof body.iterable === "object" &&
        "region" in body.iterable &&
        typeof body.iterable.region === "string" &&
        isIterableRegion(body.iterable.region)
          ? body.iterable.region
          : null;
      return { region };
    },
  });

  useEffect(() => {
    if (!settingsQuery.data?.region) {
      return;
    }
    setSelectedRegion(settingsQuery.data.region);
  }, [settingsQuery.data?.region]);

  const disconnect = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$delete({
        param: { organizationSlug, provider: ITERABLE_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(iterableConnectionPanelMessages.disconnectFailed));
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["pipes", organizationSlug, ITERABLE_PIPES_SLUG],
        }),
        queryClient.invalidateQueries({
          queryKey: ["iterable", organizationSlug],
        }),
      ]);
      setApiKey("");
      setShowApiKey(false);
      setSelectedRegion(null);
      setExpanded(false);
      toast.success(intl.formatMessage(iterableConnectionPanelMessages.disconnectedToast));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(iterableConnectionPanelMessages.disconnectFailed),
      );
    },
  });

  const saveConnection = useMutation({
    mutationFn: async (payload: { region: IterableRegion; apiKey?: string }) => {
      const response = await api.api.orgs[":organizationSlug"]["iterable"].$put({
        param: { organizationSlug },
        json: payload,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: unknown;
        } | null;
        throw new Error(
          typeof body?.message === "string" && body.message.trim()
            ? body.message
            : intl.formatMessage(iterableConnectionPanelMessages.saveFailed),
        );
      }
    },
    onSuccess: async () => {
      setApiKey("");
      setShowApiKey(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["pipes", organizationSlug, ITERABLE_PIPES_SLUG],
        }),
        queryClient.invalidateQueries({
          queryKey: ["iterable", organizationSlug],
        }),
      ]);
      toast.success(intl.formatMessage(iterableConnectionPanelMessages.savedToast));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(iterableConnectionPanelMessages.saveFailed),
      );
    },
  });

  const trimmedApiKey = apiKey.trim();
  const savedRegion = settingsQuery.data?.region ?? null;
  const canSave =
    userCanManage &&
    selectedRegion != null &&
    !saveConnection.isPending &&
    (trimmedApiKey.length > 0 || (isConnected && selectedRegion !== savedRegion));

  return (
    <CollapsibleIntegrationRow
      name={providerName}
      description={
        statusQuery.isError
          ? intl.formatMessage(iterableConnectionPanelMessages.loadErrorDescription)
          : needsReauthorization
            ? intl.formatMessage(pipesConnectionPanelMessages.reconnectHint, { providerName })
            : (summary?.detail ?? "")
      }
      icon={<IntegrationLogo src={summary?.logoSrc ?? "/images/iterable-logo.png"} />}
      isConnected={isConnected}
      userIsAdmin={userCanManage}
      expanded={expanded}
      onExpandedChange={setExpanded}
      isLoading={statusQuery.isLoading}
      isLast={isLast}
    >
      <div className="grid gap-3">
        {needsReauthorization ? (
          <p className="text-xs text-muted-foreground">
            <FormattedMessage
              {...pipesConnectionPanelMessages.reconnectHint}
              values={{ providerName }}
            />
          </p>
        ) : null}
        {isConnected && apiKeyLast4 ? (
          <p className="text-xs text-muted-foreground">
            {intl.formatMessage(iterableConnectionPanelMessages.tokenSuffix, {
              suffix: apiKeyLast4,
            })}
          </p>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            <FormattedMessage {...iterableConnectionPanelMessages.connectIntro} />
          </p>
        )}
        <Field>
          <FieldLabel htmlFor={apiKeyFieldId}>
            <FormattedMessage {...iterableConnectionPanelMessages.apiKeyLabel} />
          </FieldLabel>
          <div className="relative">
            <Input
              id={apiKeyFieldId}
              type={showApiKey ? "text" : "password"}
              autoComplete="off"
              value={apiKey}
              disabled={!userCanManage || saveConnection.isPending}
              onChange={(event) => setApiKey(event.target.value)}
              className="pe-9"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((current) => !current)}
              disabled={!userCanManage || saveConnection.isPending}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              aria-label={intl.formatMessage(
                showApiKey
                  ? iterableConnectionPanelMessages.hideApiKeyAriaLabel
                  : iterableConnectionPanelMessages.showApiKeyAriaLabel,
              )}
            >
              {showApiKey ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            <FormattedMessage
              {...(isConnected
                ? iterableConnectionPanelMessages.apiKeyRotateHint
                : iterableConnectionPanelMessages.apiKeyHint)}
            />
          </p>
        </Field>
        <Field>
          <FieldLabel htmlFor={regionFieldId}>
            <FormattedMessage {...iterableConnectionPanelMessages.regionLabel} />
          </FieldLabel>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label={intl.formatMessage(iterableConnectionPanelMessages.regionLabel)}
          >
            {ITERABLE_REGIONS.map((region) => (
              <Button
                key={region}
                id={region === selectedRegion ? regionFieldId : undefined}
                type="button"
                variant={selectedRegion === region ? "default" : "outline"}
                size="sm"
                disabled={!userCanManage || saveConnection.isPending}
                onClick={() => setSelectedRegion(region)}
                aria-pressed={selectedRegion === region}
              >
                {iterableRegionOptionLabel(region)}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            <FormattedMessage {...iterableConnectionPanelMessages.regionHint} />
          </p>
        </Field>
        {userCanManage ? (
          <div className="flex flex-wrap justify-end gap-2">
            {isConnected ? (
              <Button
                type="button"
                variant="ghost"
                disabled={disconnect.isPending || saveConnection.isPending}
                onClick={() => disconnect.mutate()}
              >
                {disconnect.isPending ? (
                  <FormattedMessage {...iterableConnectionPanelMessages.disconnecting} />
                ) : (
                  <FormattedMessage {...iterableConnectionPanelMessages.disconnect} />
                )}
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={!canSave}
              onClick={() => {
                if (!selectedRegion) {
                  return;
                }
                saveConnection.mutate({
                  region: selectedRegion,
                  ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
                });
              }}
            >
              <FloppyDiskIcon />
              {saveConnection.isPending ? (
                <FormattedMessage {...iterableConnectionPanelMessages.saving} />
              ) : (
                <FormattedMessage {...iterableConnectionPanelMessages.save} />
              )}
            </Button>
          </div>
        ) : null}
      </div>
    </CollapsibleIntegrationRow>
  );
}
