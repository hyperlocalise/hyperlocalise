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
import { useId, useMemo, useState } from "react";
import { EyeIcon, EyeSlashIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { Pipes, WorkOsWidgets } from "@workos-inc/widgets";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createApiClient } from "@/lib/api-client";
import { HUBSPOT_PIPES_SLUG } from "@/lib/hubspot/constants";
import { resolveWorkspaceIntegrationSummary } from "@/lib/integrations/workspace-integrations";

import { CollapsibleIntegrationRow } from "./integration-row";
import { IntegrationLogo } from "./integration-logo";
import { hubspotConnectionPanelMessages } from "./hubspot-connection-panel.messages";
import { pipesConnectionPanelMessages } from "./pipes-connection-panel.messages";
import { usePipesStatus } from "./pipes-connection-panel";

import "@radix-ui/themes/styles.css";
import "@workos-inc/widgets/styles.css";

const api = createApiClient();

export function HubspotConnectionPanel({
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
  const { getAccessToken } = useAccessToken();
  const apiKeyFieldId = useId();
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const statusQuery = usePipesStatus(organizationSlug, HUBSPOT_PIPES_SLUG, expanded);
  const summary = useMemo(
    () => resolveWorkspaceIntegrationSummary(intl, HUBSPOT_PIPES_SLUG),
    [intl],
  );
  const providerName = summary?.name ?? "HubSpot";
  const userCanManage = !disabled;
  const isConnected = Boolean(statusQuery.data?.connected);
  const needsReauthorization = Boolean(statusQuery.data?.needsReauthorization);
  const apiKeyLast4 = statusQuery.data?.apiKeyLast4 ?? null;

  const disconnect = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$delete({
        param: { organizationSlug, provider: HUBSPOT_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(hubspotConnectionPanelMessages.disconnectFailed));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["pipes", organizationSlug, HUBSPOT_PIPES_SLUG],
      });
      setApiKey("");
      setShowApiKey(false);
      setExpanded(false);
      toast.success(intl.formatMessage(hubspotConnectionPanelMessages.disconnectedToast));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(hubspotConnectionPanelMessages.disconnectFailed),
      );
    },
  });

  const saveConnection = useMutation({
    mutationFn: async (payload: { apiKey?: string }) => {
      const response = await api.api.orgs[":organizationSlug"].hubspot.$put({
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
            : intl.formatMessage(hubspotConnectionPanelMessages.saveFailed),
        );
      }
    },
    onSuccess: async () => {
      setApiKey("");
      setShowApiKey(false);
      await queryClient.invalidateQueries({
        queryKey: ["pipes", organizationSlug, HUBSPOT_PIPES_SLUG],
      });
      toast.success(intl.formatMessage(hubspotConnectionPanelMessages.savedToast));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(hubspotConnectionPanelMessages.saveFailed),
      );
    },
  });

  const trimmedApiKey = apiKey.trim();
  const canSave = userCanManage && !saveConnection.isPending && trimmedApiKey.length > 0;

  async function resolvePipesAuthToken() {
    const token = await getAccessToken();
    if (!token) {
      throw new Error(
        intl.formatMessage(pipesConnectionPanelMessages.tokenRequired, { providerName }),
      );
    }
    return token;
  }

  return (
    <CollapsibleIntegrationRow
      name={providerName}
      description={
        statusQuery.isError
          ? intl.formatMessage(hubspotConnectionPanelMessages.loadErrorDescription)
          : needsReauthorization
            ? intl.formatMessage(pipesConnectionPanelMessages.reconnectHint, { providerName })
            : (summary?.detail ?? "")
      }
      icon={<IntegrationLogo src={summary?.logoSrc ?? "/images/hubspot-logo.svg"} />}
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
            {intl.formatMessage(hubspotConnectionPanelMessages.tokenSuffix, {
              suffix: apiKeyLast4,
            })}
          </p>
        ) : isConnected ? (
          <p className="text-sm leading-6 text-muted-foreground">
            <FormattedMessage {...hubspotConnectionPanelMessages.oauthConnected} />
          </p>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            <FormattedMessage {...hubspotConnectionPanelMessages.connectIntro} />
          </p>
        )}
        {userCanManage ? (
          <WorkOsWidgets queryClient={queryClient}>
            <Pipes authToken={resolvePipesAuthToken} filter={{ slugs: [HUBSPOT_PIPES_SLUG] }} />
          </WorkOsWidgets>
        ) : null}
        <p className="text-sm font-medium text-foreground">
          <FormattedMessage {...hubspotConnectionPanelMessages.accessTokenHeading} />
        </p>
        <Field>
          <FieldLabel htmlFor={apiKeyFieldId}>
            <FormattedMessage {...hubspotConnectionPanelMessages.apiKeyLabel} />
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
                  ? hubspotConnectionPanelMessages.hideApiKeyAriaLabel
                  : hubspotConnectionPanelMessages.showApiKeyAriaLabel,
              )}
            >
              {showApiKey ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            <FormattedMessage
              {...(isConnected
                ? hubspotConnectionPanelMessages.apiKeyRotateHint
                : hubspotConnectionPanelMessages.apiKeyHint)}
            />
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
                  <FormattedMessage {...hubspotConnectionPanelMessages.disconnecting} />
                ) : (
                  <FormattedMessage {...hubspotConnectionPanelMessages.disconnect} />
                )}
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={!canSave}
              onClick={() => {
                if (!trimmedApiKey) {
                  return;
                }
                saveConnection.mutate({ apiKey: trimmedApiKey });
              }}
            >
              <FloppyDiskIcon />
              {saveConnection.isPending ? (
                <FormattedMessage {...hubspotConnectionPanelMessages.saving} />
              ) : (
                <FormattedMessage {...hubspotConnectionPanelMessages.save} />
              )}
            </Button>
          </div>
        ) : null}
      </div>
    </CollapsibleIntegrationRow>
  );
}
