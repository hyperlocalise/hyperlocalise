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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { buildAutomationsPath } from "@/components/app-shell/navigation-config";
import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Rows } from "@/components/ui/layout/rows";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { createApiClient } from "@/lib/api-client";
import { resolveWorkspaceIntegrationSummary } from "@/lib/integrations/workspace-integrations";
import { SANITY_PIPES_SLUG } from "@/lib/sanity/constants";
import type { SanityManageProject } from "@/lib/sanity/types";

import { IntegrationLogo } from "./integration-logo";
import { IntegrationRow } from "./integration-row";
import { pipesConnectionPanelMessages } from "./pipes-connection-panel.messages";
import { sanityConnectionPanelMessages } from "./sanity-connection-panel.messages";
import { usePipesStatus } from "./pipes-connection-panel";

const api = createApiClient();

export function SanityConnectionPanel({
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
  const statusQuery = usePipesStatus(organizationSlug, SANITY_PIPES_SLUG, expanded);
  const summary = useMemo(
    () => resolveWorkspaceIntegrationSummary(intl, SANITY_PIPES_SLUG),
    [intl],
  );
  const providerName = summary?.name ?? "Sanity";
  const userCanManage = !disabled;
  const isConnected = Boolean(statusQuery.data?.connected);
  const needsReauthorization = Boolean(statusQuery.data?.needsReauthorization);
  const apiKeyLast4 = statusQuery.data?.apiKeyLast4 ?? null;
  const projectsQuery = useQuery({
    queryKey: ["sanity-projects", organizationSlug],
    enabled: expanded && isConnected,
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].sanity.projects.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load Sanity projects");
      }
      const body = await response.json();
      if (!("projects" in body) || !Array.isArray(body.projects)) {
        throw new Error("Failed to load Sanity projects");
      }
      return body.projects as SanityManageProject[];
    },
  });
  const projects = projectsQuery.data ?? [];

  const connect = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"][
        "authorize-url"
      ].$get({
        param: { organizationSlug, provider: SANITY_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(sanityConnectionPanelMessages.authorizeUrlFailedToast));
      }
      const body = await response.json();
      if (!("url" in body) || typeof body.url !== "string" || body.url.length === 0) {
        throw new Error(intl.formatMessage(sanityConnectionPanelMessages.authorizeUrlFailedToast));
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
          : intl.formatMessage(sanityConnectionPanelMessages.authorizeUrlFailedToast),
      );
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$delete({
        param: { organizationSlug, provider: SANITY_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(sanityConnectionPanelMessages.disconnectFailed));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["pipes", organizationSlug, SANITY_PIPES_SLUG],
      });
      setExpanded(false);
      toast.success(intl.formatMessage(sanityConnectionPanelMessages.disconnectedToast));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(sanityConnectionPanelMessages.disconnectFailed),
      );
    },
  });

  const handleConnect = useCallback(() => {
    connect.mutate();
  }, [connect]);

  const action = !userCanManage ? "view-only" : isConnected ? "manage" : "connect";
  const description = statusQuery.isError
    ? intl.formatMessage(sanityConnectionPanelMessages.loadErrorDescription)
    : needsReauthorization
      ? intl.formatMessage(pipesConnectionPanelMessages.reconnectHint, { providerName })
      : (summary?.detail ?? "");

  return (
    <IntegrationRow
      name={providerName}
      description={description}
      icon={<IntegrationLogo src={summary?.logoSrc ?? "/images/sanity-logo.svg"} />}
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
          <Box padding="1.5u" background="canvas" border="standard" borderRadius="standard">
            <Rows spacing="1u">
              <TypographyP size="small" weight="medium" tone="content">
                <FormattedMessage {...sanityConnectionPanelMessages.connectedStatus} />
              </TypographyP>
              {apiKeyLast4 ? (
                <TypographyP size="xsmall" tone="subtle">
                  {intl.formatMessage(sanityConnectionPanelMessages.tokenSuffix, {
                    suffix: apiKeyLast4,
                  })}
                </TypographyP>
              ) : null}
              <TypographyP size="small" tone="subtle">
                <FormattedMessage {...sanityConnectionPanelMessages.connectedDescription} />
              </TypographyP>
              {projectsQuery.isLoading ? <Skeleton className="h-4 w-32" /> : null}
              {projects.length > 0 ? (
                <Rows spacing="0.5u">
                  <TypographyP size="xsmall" weight="medium" tone="content">
                    <FormattedMessage {...sanityConnectionPanelMessages.projectsLabel} />
                  </TypographyP>
                  {projects.map((project) => (
                    <TypographyP key={project.id} size="small" tone="content">
                      {project.displayName}
                    </TypographyP>
                  ))}
                </Rows>
              ) : projectsQuery.isSuccess ? (
                <TypographyP size="xsmall" tone="subtle">
                  <FormattedMessage {...sanityConnectionPanelMessages.noProjects} />
                </TypographyP>
              ) : null}
            </Rows>
          </Box>
          <Box display="flex" flexWrap="wrap" gap="1u">
            <Button
              variant="outline"
              size="sm"
              render={<Link href={buildAutomationsPath(organizationSlug)} />}
            >
              <FormattedMessage {...sanityConnectionPanelMessages.openAutomations} />
            </Button>
            {userCanManage ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? (
                  <FormattedMessage {...sanityConnectionPanelMessages.disconnecting} />
                ) : (
                  <FormattedMessage {...sanityConnectionPanelMessages.disconnect} />
                )}
              </Button>
            ) : null}
          </Box>
        </Rows>
      )}
    </IntegrationRow>
  );
}
