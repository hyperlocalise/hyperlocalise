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
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { siBitbucket } from "simple-icons";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyP } from "@/components/ui/typography";
import { createApiClient } from "@/lib/api-client";
import { BITBUCKET_PIPES_SLUG } from "@/lib/bitbucket/constants";

import { bitbucketConnectionPanelMessages as messages } from "./bitbucket-connection-panel.messages";
import { IntegrationRow } from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";

const api = createApiClient();

const SIGN_IN_WINDOW_NAME = "hyperlocalise-bitbucket-sign-in";
const SIGN_IN_WINDOW_WIDTH = 520;
const SIGN_IN_WINDOW_HEIGHT = 720;
const PIPES_CONNECTED_MESSAGE = "hyperlocalise-pipes-connected";

export const bitbucketConnectionQueryKey = (organizationSlug: string) =>
  ["bitbucket", organizationSlug, "connection"] as const;

function openSignInWindow(url: string): Window | null {
  const left = Math.round(window.screenX + (window.outerWidth - SIGN_IN_WINDOW_WIDTH) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - SIGN_IN_WINDOW_HEIGHT) / 2);
  return window.open(
    url,
    SIGN_IN_WINDOW_NAME,
    `popup=yes,width=${SIGN_IN_WINDOW_WIDTH},height=${SIGN_IN_WINDOW_HEIGHT},left=${left},top=${top},scrollbars=yes,resizable=yes`,
  );
}

function isConnectedMessage(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    data.type === PIPES_CONNECTED_MESSAGE &&
    "provider" in data &&
    data.provider === BITBUCKET_PIPES_SLUG
  );
}

/** The workspace's shared Bitbucket connection; null when this person's role can't see it. */
export function useBitbucketConnection(organizationSlug: string) {
  return useQuery({
    queryKey: bitbucketConnectionQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].bitbucket.connection.$get({
        param: { organizationSlug },
      });
      if (response.status === 403) {
        return null;
      }
      if (!response.ok) {
        throw new Error("bitbucket_connection_load_failed");
      }
      const body = await response.json();
      return "bitbucketConnection" in body ? body.bitbucketConnection : null;
    },
  });
}

/**
 * Bitbucket Cloud for the whole workspace: an admin signs in once and every project sync uses
 * that account, with nobody signed in.
 */
export function BitbucketConnectionPanel({
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
  const signInWindowRef = useRef<Window | null>(null);
  const statusQuery = useBitbucketConnection(organizationSlug);
  const status = statusQuery.data ?? null;
  const userCanManage = !disabled;
  const isConnected = Boolean(status?.connected) && !status?.needsReconnect;

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: bitbucketConnectionQueryKey(organizationSlug),
    });
    // The project Sync panels list repositories through this connection.
    await queryClient.invalidateQueries({ queryKey: ["project-content-sync", organizationSlug] });
  }, [organizationSlug, queryClient]);

  const connect = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].bitbucket.connection[
        "authorize-url"
      ].$get({ param: { organizationSlug } });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.connectFailed));
      }
      const body = await response.json();
      if (!("url" in body) || typeof body.url !== "string" || !body.url) {
        throw new Error(intl.formatMessage(messages.connectFailed));
      }
      return body.url;
    },
    onSuccess: (url) => {
      const opened = signInWindowRef.current;
      if (opened && !opened.closed) {
        opened.location.href = url;
        return;
      }
      const popup = openSignInWindow(url);
      if (!popup) {
        toast.error(intl.formatMessage(messages.popupBlocked));
        return;
      }
      signInWindowRef.current = popup;
    },
    onError: (error) => {
      signInWindowRef.current?.close();
      signInWindowRef.current = null;
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.connectFailed),
      );
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].bitbucket.connection.$delete({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.disconnectFailed));
      }
    },
    onSuccess: async () => {
      await refresh();
      setExpanded(false);
      toast.success(intl.formatMessage(messages.disconnectedToast));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.disconnectFailed),
      );
    },
  });

  // The sign-in window lands back on Integrations, tells this page, and closes.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("pipesCallback") !== BITBUCKET_PIPES_SLUG) {
      return;
    }
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        { type: PIPES_CONNECTED_MESSAGE, provider: BITBUCKET_PIPES_SLUG },
        window.location.origin,
      );
      window.close();
    }
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin === window.location.origin && isConnectedMessage(event.data)) {
        void refresh();
        setExpanded(true);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [refresh]);

  // A window closed without finishing still refreshes, so a finished sign-in is never missed.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const popup = signInWindowRef.current;
      if (popup?.closed) {
        signInWindowRef.current = null;
        void refresh();
      }
    }, 800);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const handleConnect = useCallback(() => {
    // Opened on the click itself, so the browser doesn't block it while the address loads.
    const popup = openSignInWindow("about:blank");
    if (!popup) {
      toast.error(intl.formatMessage(messages.popupBlocked));
      return;
    }
    signInWindowRef.current = popup;
    connect.mutate();
  }, [connect, intl]);

  const description = statusQuery.isError
    ? intl.formatMessage(messages.loadError)
    : status?.connectorLeft
      ? intl.formatMessage(messages.connectorLeftDescription)
      : status?.needsReconnect
        ? intl.formatMessage(messages.reconnectDescription)
        : isConnected
          ? status?.accountName
            ? intl.formatMessage(messages.connectedAsDescription, { account: status.accountName })
            : intl.formatMessage(messages.connectedDescription)
          : intl.formatMessage(messages.description);
  const action = !userCanManage ? "view-only" : isConnected ? "manage" : "connect";

  return (
    <IntegrationRow
      name={intl.formatMessage(messages.name)}
      description={description}
      icon={<SimpleBrandIcon icon={siBitbucket} colored={isConnected} />}
      action={action}
      expanded={expanded}
      onExpandedChange={setExpanded}
      onConnect={handleConnect}
      isConnecting={connect.isPending}
      isLoading={statusQuery.isLoading}
      isLast={isLast}
    >
      <Rows spacing="2u">
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.sharedHint} />
        </TypographyP>
        {userCanManage ? (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              <FormattedMessage
                {...(disconnect.isPending ? messages.disconnecting : messages.disconnect)}
              />
            </Button>
          </div>
        ) : null}
      </Rows>
    </IntegrationRow>
  );
}
