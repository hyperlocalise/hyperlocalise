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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createApiClient } from "@/lib/api-client";
import {
  BRAZE_PIPES_SLUG,
  BRAZE_REST_ENDPOINTS,
  brazeRestEndpointOptionLabel,
  isBrazeRestEndpoint,
  type BrazeRestEndpoint,
} from "@/lib/braze/constants";
import { resolveWorkspaceIntegrationSummary } from "@/lib/integrations/workspace-integrations";

import { brazeConnectionPanelMessages } from "./braze-connection-panel.messages";
import { IntegrationLogo } from "./integration-logo";
import { CollapsibleIntegrationRow } from "./integration-row";
import { pipesConnectionPanelMessages } from "./pipes-connection-panel.messages";
import { usePipesStatus } from "./pipes-connection-panel";

const api = createApiClient();

export function BrazeConnectionPanel({
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
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<BrazeRestEndpoint | null>(null);
  const statusQuery = usePipesStatus(organizationSlug, BRAZE_PIPES_SLUG, expanded);
  const summary = useMemo(() => resolveWorkspaceIntegrationSummary(intl, BRAZE_PIPES_SLUG), [intl]);
  const providerName = summary?.name ?? "Braze";
  const userCanManage = !disabled;
  const isConnected = Boolean(statusQuery.data?.connected);
  const needsReauthorization = Boolean(statusQuery.data?.needsReauthorization);
  const apiKeyLast4 = statusQuery.data?.apiKeyLast4 ?? null;

  const settingsQuery = useQuery({
    queryKey: ["braze", organizationSlug],
    enabled: expanded && isConnected,
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].braze.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(brazeConnectionPanelMessages.loadFailed));
      }
      const body = await response.json();
      const restEndpoint =
        "braze" in body &&
        body.braze &&
        typeof body.braze === "object" &&
        "restEndpoint" in body.braze &&
        typeof body.braze.restEndpoint === "string" &&
        isBrazeRestEndpoint(body.braze.restEndpoint)
          ? body.braze.restEndpoint
          : null;
      return { restEndpoint };
    },
  });

  useEffect(() => {
    if (!settingsQuery.data?.restEndpoint) {
      return;
    }
    setSelectedEndpoint(settingsQuery.data.restEndpoint);
  }, [settingsQuery.data?.restEndpoint]);

  const disconnect = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$delete({
        param: { organizationSlug, provider: BRAZE_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(brazeConnectionPanelMessages.disconnectFailed));
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["pipes", organizationSlug, BRAZE_PIPES_SLUG],
        }),
        queryClient.invalidateQueries({
          queryKey: ["braze", organizationSlug],
        }),
      ]);
      setApiKey("");
      setShowApiKey(false);
      setSelectedEndpoint(null);
      setExpanded(false);
      toast.success(intl.formatMessage(brazeConnectionPanelMessages.disconnectedToast));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(brazeConnectionPanelMessages.disconnectFailed),
      );
    },
  });

  const saveConnection = useMutation({
    mutationFn: async (payload: { restEndpoint: BrazeRestEndpoint; apiKey?: string }) => {
      const response = await api.api.orgs[":organizationSlug"].braze.$put({
        param: { organizationSlug },
        json: payload,
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(brazeConnectionPanelMessages.saveFailed));
      }
    },
    onSuccess: async () => {
      setApiKey("");
      setShowApiKey(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["pipes", organizationSlug, BRAZE_PIPES_SLUG],
        }),
        queryClient.invalidateQueries({
          queryKey: ["braze", organizationSlug],
        }),
      ]);
      toast.success(intl.formatMessage(brazeConnectionPanelMessages.savedToast));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(brazeConnectionPanelMessages.saveFailed),
      );
    },
  });

  const trimmedApiKey = apiKey.trim();
  const savedEndpoint = settingsQuery.data?.restEndpoint ?? null;
  const canSave =
    userCanManage &&
    selectedEndpoint != null &&
    !saveConnection.isPending &&
    (trimmedApiKey.length > 0 || (isConnected && selectedEndpoint !== savedEndpoint));

  return (
    <CollapsibleIntegrationRow
      name={providerName}
      description={
        statusQuery.isError
          ? intl.formatMessage(brazeConnectionPanelMessages.loadErrorDescription)
          : needsReauthorization
            ? intl.formatMessage(pipesConnectionPanelMessages.reconnectHint, { providerName })
            : (summary?.detail ?? "")
      }
      icon={<IntegrationLogo src={summary?.logoSrc ?? "/images/braze-logo.svg"} />}
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
            {intl.formatMessage(brazeConnectionPanelMessages.tokenSuffix, {
              suffix: apiKeyLast4,
            })}
          </p>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            <FormattedMessage {...brazeConnectionPanelMessages.connectIntro} />
          </p>
        )}
        <Field>
          <FieldLabel htmlFor={apiKeyFieldId}>
            <FormattedMessage {...brazeConnectionPanelMessages.apiKeyLabel} />
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
                  ? brazeConnectionPanelMessages.hideApiKeyAriaLabel
                  : brazeConnectionPanelMessages.showApiKeyAriaLabel,
              )}
            >
              {showApiKey ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            <FormattedMessage
              {...(isConnected
                ? brazeConnectionPanelMessages.apiKeyRotateHint
                : brazeConnectionPanelMessages.apiKeyHint)}
            />
          </p>
        </Field>
        <Field>
          <FieldLabel>
            <FormattedMessage {...brazeConnectionPanelMessages.clusterLabel} />
          </FieldLabel>
          <Select
            value={selectedEndpoint ?? undefined}
            disabled={!userCanManage || saveConnection.isPending}
            onValueChange={(value) => {
              if (typeof value !== "string" || !isBrazeRestEndpoint(value)) {
                return;
              }
              setSelectedEndpoint(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRAZE_REST_ENDPOINTS.map((endpoint) => (
                <SelectItem
                  key={endpoint}
                  value={endpoint}
                  label={brazeRestEndpointOptionLabel(endpoint)}
                >
                  {brazeRestEndpointOptionLabel(endpoint)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            <FormattedMessage {...brazeConnectionPanelMessages.clusterHint} />
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
                  <FormattedMessage {...brazeConnectionPanelMessages.disconnecting} />
                ) : (
                  <FormattedMessage {...brazeConnectionPanelMessages.disconnect} />
                )}
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={!canSave}
              onClick={() => {
                if (!selectedEndpoint) {
                  return;
                }
                saveConnection.mutate({
                  restEndpoint: selectedEndpoint,
                  ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
                });
              }}
            >
              <FloppyDiskIcon />
              {saveConnection.isPending ? (
                <FormattedMessage {...brazeConnectionPanelMessages.saving} />
              ) : (
                <FormattedMessage {...brazeConnectionPanelMessages.save} />
              )}
            </Button>
          </div>
        ) : null}
      </div>
    </CollapsibleIntegrationRow>
  );
}
