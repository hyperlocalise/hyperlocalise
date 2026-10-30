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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Rows } from "@/components/ui/layout/rows";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { createApiClient } from "@/lib/api-client";
import { HUBSPOT_PIPES_SLUG } from "@/lib/hubspot/constants";
import { resolveWorkspaceIntegrationSummary } from "@/lib/integrations/workspace-integrations";

import { hubspotConnectionPanelMessages } from "./hubspot-connection-panel.messages";
import { IntegrationLogo } from "./integration-logo";
import { IntegrationRow } from "./integration-row";
import { pipesConnectionPanelMessages } from "./pipes-connection-panel.messages";
import { usePipesStatus } from "./pipes-connection-panel";

const api = createApiClient();

const HUBSPOT_OAUTH_WINDOW_NAME = "hyperlocalise-hubspot-oauth";
const HUBSPOT_OAUTH_WINDOW_FEATURES = "width=520,height=720,scrollbars=yes,resizable=yes";
const PIPES_CONNECTED_MESSAGE = "hyperlocalise-pipes-connected";

function isPipesConnectedMessage(data: unknown): data is { type: string; provider: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    data.type === PIPES_CONNECTED_MESSAGE &&
    "provider" in data &&
    data.provider === HUBSPOT_PIPES_SLUG
  );
}

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
  const [expanded, setExpanded] = useState(false);
  const authWindowRef = useRef<Window | null>(null);
  const statusQuery = usePipesStatus(organizationSlug, HUBSPOT_PIPES_SLUG, expanded);
  const summary = useMemo(
    () => resolveWorkspaceIntegrationSummary(intl, HUBSPOT_PIPES_SLUG),
    [intl],
  );
  const providerName = summary?.name ?? "HubSpot";
  const userCanManage = !disabled;
  const isConnected = Boolean(statusQuery.data?.connected);
  const needsReauthorization = Boolean(statusQuery.data?.needsReauthorization);

  const connect = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"][
        "authorize-url"
      ].$get({
        param: { organizationSlug, provider: HUBSPOT_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(hubspotConnectionPanelMessages.authorizeUrlFailedToast));
      }
      const body = await response.json();
      if (!("url" in body) || typeof body.url !== "string" || body.url.length === 0) {
        throw new Error(intl.formatMessage(hubspotConnectionPanelMessages.authorizeUrlFailedToast));
      }
      return body.url;
    },
    onSuccess: (url) => {
      const popup = authWindowRef.current;
      if (popup && !popup.closed) {
        popup.location.href = url;
        return;
      }
      const opened = window.open(url, HUBSPOT_OAUTH_WINDOW_NAME, HUBSPOT_OAUTH_WINDOW_FEATURES);
      if (!opened) {
        toast.error(intl.formatMessage(hubspotConnectionPanelMessages.popupBlockedToast));
        return;
      }
      authWindowRef.current = opened;
    },
    onError: (error) => {
      authWindowRef.current?.close();
      authWindowRef.current = null;
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(hubspotConnectionPanelMessages.authorizeUrlFailedToast),
      );
    },
  });

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

  const refreshAfterOAuth = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ["pipes", organizationSlug, HUBSPOT_PIPES_SLUG],
    });
    setExpanded(true);
  }, [organizationSlug, queryClient]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (!isPipesConnectedMessage(event.data)) {
        return;
      }
      void refreshAfterOAuth();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [refreshAfterOAuth]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const popup = authWindowRef.current;
      if (!popup || !popup.closed) {
        return;
      }
      authWindowRef.current = null;
      void refreshAfterOAuth();
    }, 800);
    return () => window.clearInterval(timer);
  }, [refreshAfterOAuth]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("pipesCallback") !== HUBSPOT_PIPES_SLUG) {
      return;
    }
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        { type: PIPES_CONNECTED_MESSAGE, provider: HUBSPOT_PIPES_SLUG },
        window.location.origin,
      );
    }
    window.close();
  }, []);

  const handleConnect = useCallback(() => {
    const popup = window.open(
      "about:blank",
      HUBSPOT_OAUTH_WINDOW_NAME,
      HUBSPOT_OAUTH_WINDOW_FEATURES,
    );
    if (!popup) {
      toast.error(intl.formatMessage(hubspotConnectionPanelMessages.popupBlockedToast));
      return;
    }
    authWindowRef.current = popup;
    connect.mutate();
  }, [connect, intl]);

  const action = !userCanManage ? "view-only" : isConnected ? "manage" : "connect";
  const description = statusQuery.isError
    ? intl.formatMessage(hubspotConnectionPanelMessages.loadErrorDescription)
    : needsReauthorization
      ? intl.formatMessage(pipesConnectionPanelMessages.reconnectHint, { providerName })
      : (summary?.detail ?? "");

  return (
    <IntegrationRow
      name={providerName}
      description={description}
      icon={<IntegrationLogo src={summary?.logoSrc ?? "/images/hubspot-logo.svg"} />}
      action={action}
      expanded={expanded}
      onExpandedChange={setExpanded}
      onConnect={handleConnect}
      isConnecting={connect.isPending}
      isLoading={statusQuery.isLoading}
      isLast={isLast}
    >
      {statusQuery.isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : (
        <Rows spacing="2u">
          {needsReauthorization ? (
            <TypographyP size="small" tone="subtle">
              <FormattedMessage
                {...pipesConnectionPanelMessages.reconnectHint}
                values={{ providerName }}
              />
            </TypographyP>
          ) : null}
          {isConnected && userCanManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              {disconnect.isPending ? (
                <FormattedMessage {...hubspotConnectionPanelMessages.disconnecting} />
              ) : (
                <FormattedMessage {...hubspotConnectionPanelMessages.disconnect} />
              )}
            </Button>
          ) : null}
        </Rows>
      )}
    </IntegrationRow>
  );
}
