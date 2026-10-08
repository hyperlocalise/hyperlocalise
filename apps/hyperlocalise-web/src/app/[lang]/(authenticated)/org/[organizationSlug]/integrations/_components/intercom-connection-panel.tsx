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
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Rows } from "@/components/ui/layout/rows";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { createApiClient } from "@/lib/api-client";
import { resolveWorkspaceIntegrationSummary } from "@/lib/integrations/workspace-integrations";
import { INTERCOM_PIPES_SLUG } from "@/lib/intercom/constants";

import { IntegrationLogo } from "./integration-logo";
import { IntegrationRow } from "./integration-row";
import { intercomConnectionPanelMessages } from "./intercom-connection-panel.messages";
import { pipesConnectionPanelMessages } from "./pipes-connection-panel.messages";
import { usePipesStatus } from "./pipes-connection-panel";

const api = createApiClient();

export function IntercomConnectionPanel({
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
  const statusQuery = usePipesStatus(organizationSlug, INTERCOM_PIPES_SLUG, expanded);
  const summary = useMemo(
    () => resolveWorkspaceIntegrationSummary(intl, INTERCOM_PIPES_SLUG),
    [intl],
  );
  const providerName = summary?.name ?? "Intercom";
  const userCanManage = !disabled;
  const isConnected = Boolean(statusQuery.data?.connected);
  const needsReauthorization = Boolean(statusQuery.data?.needsReauthorization);
  const apiKeyLast4 = statusQuery.data?.apiKeyLast4 ?? null;

  const connect = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"][
        "authorize-url"
      ].$get({
        param: { organizationSlug, provider: INTERCOM_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error(
          intl.formatMessage(intercomConnectionPanelMessages.authorizeUrlFailedToast),
        );
      }
      const body = await response.json();
      if (!("url" in body) || typeof body.url !== "string" || body.url.length === 0) {
        throw new Error(
          intl.formatMessage(intercomConnectionPanelMessages.authorizeUrlFailedToast),
        );
      }
      return body.url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(intercomConnectionPanelMessages.authorizeUrlFailedToast),
      );
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$delete({
        param: { organizationSlug, provider: INTERCOM_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(intercomConnectionPanelMessages.disconnectFailed));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["pipes", organizationSlug, INTERCOM_PIPES_SLUG],
      });
      setExpanded(false);
      toast.success(intl.formatMessage(intercomConnectionPanelMessages.disconnectedToast));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(intercomConnectionPanelMessages.disconnectFailed),
      );
    },
  });

  const handleConnect = useCallback(() => {
    connect.mutate();
  }, [connect]);

  const action = !userCanManage ? "view-only" : isConnected ? "manage" : "connect";
  const description = statusQuery.isError
    ? intl.formatMessage(intercomConnectionPanelMessages.loadErrorDescription)
    : needsReauthorization
      ? intl.formatMessage(pipesConnectionPanelMessages.reconnectHint, { providerName })
      : (summary?.detail ?? "");

  return (
    <IntegrationRow
      name={providerName}
      description={description}
      icon={<IntegrationLogo src={summary?.logoSrc ?? "/images/intercom-logo.svg"} />}
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
          <TypographyP size="small" weight="medium" tone="content">
            {apiKeyLast4
              ? intl.formatMessage(intercomConnectionPanelMessages.connectedStatusWithToken, {
                  suffix: apiKeyLast4,
                })
              : intl.formatMessage(intercomConnectionPanelMessages.connectedStatus)}
          </TypographyP>
          {userCanManage ? (
            <Box display="flex" flexWrap="wrap" gap="1u">
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? (
                  <FormattedMessage {...intercomConnectionPanelMessages.disconnecting} />
                ) : (
                  <FormattedMessage {...intercomConnectionPanelMessages.disconnect} />
                )}
              </Button>
            </Box>
          ) : null}
        </Rows>
      )}
    </IntegrationRow>
  );
}
