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
import { resolveWorkspaceIntegrationSummary } from "@/lib/integrations/workspace-integrations";
import { GOOGLE_DRIVE_PIPES_SLUG } from "@/lib/google-drive/constants";

import { IntegrationRow } from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { googleDriveConnectionPanelMessages } from "./google-drive-connection-panel.messages";
import { GoogleDriveFolderManagement } from "./google-drive-folder-management";
import { pipesConnectionPanelMessages } from "./pipes-connection-panel.messages";
import { usePipesStatus } from "./pipes-connection-panel";

const api = createApiClient();

const GOOGLE_DRIVE_OAUTH_WINDOW_NAME = "hyperlocalise-google-drive-oauth";
const GOOGLE_DRIVE_OAUTH_WINDOW_FEATURES = "width=520,height=720,scrollbars=yes,resizable=yes";
const PIPES_CONNECTED_MESSAGE = "hyperlocalise-pipes-connected";

function isPipesConnectedMessage(data: unknown): data is { type: string; provider: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    data.type === PIPES_CONNECTED_MESSAGE &&
    "provider" in data &&
    data.provider === GOOGLE_DRIVE_PIPES_SLUG
  );
}

export function GoogleDriveConnectionPanel({
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
  const statusQuery = usePipesStatus(organizationSlug, GOOGLE_DRIVE_PIPES_SLUG, expanded);
  const summary = useMemo(
    () => resolveWorkspaceIntegrationSummary(intl, GOOGLE_DRIVE_PIPES_SLUG),
    [intl],
  );
  const providerName = summary?.name ?? "Google Drive";
  const userCanManage = !disabled;
  const isConnected = Boolean(statusQuery.data?.connected);
  const needsReauthorization = Boolean(statusQuery.data?.needsReauthorization);

  const connect = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"][
        "authorize-url"
      ].$get({
        param: { organizationSlug, provider: GOOGLE_DRIVE_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error(
          intl.formatMessage(googleDriveConnectionPanelMessages.authorizeUrlFailedToast),
        );
      }
      const body = await response.json();
      if (!("url" in body) || typeof body.url !== "string" || body.url.length === 0) {
        throw new Error(
          intl.formatMessage(googleDriveConnectionPanelMessages.authorizeUrlFailedToast),
        );
      }
      return body.url;
    },
    onSuccess: (url) => {
      const popup = authWindowRef.current;
      if (popup && !popup.closed) {
        popup.location.href = url;
        return;
      }
      const opened = window.open(
        url,
        GOOGLE_DRIVE_OAUTH_WINDOW_NAME,
        GOOGLE_DRIVE_OAUTH_WINDOW_FEATURES,
      );
      if (!opened) {
        toast.error(intl.formatMessage(googleDriveConnectionPanelMessages.popupBlockedToast));
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
          : intl.formatMessage(googleDriveConnectionPanelMessages.authorizeUrlFailedToast),
      );
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$delete({
        param: { organizationSlug, provider: GOOGLE_DRIVE_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(googleDriveConnectionPanelMessages.disconnectFailed));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["pipes", organizationSlug, GOOGLE_DRIVE_PIPES_SLUG],
      });
      setExpanded(false);
      toast.success(intl.formatMessage(googleDriveConnectionPanelMessages.disconnectedToast));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(googleDriveConnectionPanelMessages.disconnectFailed),
      );
    },
  });

  const refreshAfterOAuth = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ["pipes", organizationSlug, GOOGLE_DRIVE_PIPES_SLUG],
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
    if (params.get("pipesCallback") !== GOOGLE_DRIVE_PIPES_SLUG) {
      return;
    }
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        { type: PIPES_CONNECTED_MESSAGE, provider: GOOGLE_DRIVE_PIPES_SLUG },
        window.location.origin,
      );
    }
    window.close();
  }, []);

  const handleConnect = useCallback(() => {
    const popup = window.open(
      "about:blank",
      GOOGLE_DRIVE_OAUTH_WINDOW_NAME,
      GOOGLE_DRIVE_OAUTH_WINDOW_FEATURES,
    );
    if (!popup) {
      toast.error(intl.formatMessage(googleDriveConnectionPanelMessages.popupBlockedToast));
      return;
    }
    authWindowRef.current = popup;
    connect.mutate();
  }, [connect, intl]);

  const action = !userCanManage ? "view-only" : isConnected ? "manage" : "connect";
  const description = statusQuery.isError
    ? intl.formatMessage(googleDriveConnectionPanelMessages.loadErrorDescription)
    : needsReauthorization
      ? intl.formatMessage(pipesConnectionPanelMessages.reconnectHint, { providerName })
      : (summary?.detail ?? "");

  return (
    <IntegrationRow
      name={providerName}
      description={description}
      icon={summary?.icon ? <SimpleBrandIcon icon={summary.icon} colored={isConnected} /> : null}
      iconMuted={!isConnected}
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
          {isConnected ? (
            <>
              <GoogleDriveFolderManagement
                organizationSlug={organizationSlug}
                disabled={disabled}
              />
              {userCanManage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disconnect.isPending}
                  onClick={() => disconnect.mutate()}
                >
                  Disconnect
                </Button>
              ) : null}
            </>
          ) : null}
        </Rows>
      )}
    </IntegrationRow>
  );
}
