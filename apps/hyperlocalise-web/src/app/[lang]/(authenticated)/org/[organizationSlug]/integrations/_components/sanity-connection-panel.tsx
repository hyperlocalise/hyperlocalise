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
import { useMemo, useState } from "react";
import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { Pipes, WorkOsWidgets } from "@workos-inc/widgets";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { buildAutomationsPath } from "@/components/app-shell/navigation-config";
import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Rows } from "@/components/ui/layout/rows";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyMuted, TypographyP } from "@/components/ui/typography";
import { createApiClient } from "@/lib/api-client";
import { resolveWorkspaceIntegrationSummary } from "@/lib/integrations/workspace-integrations";
import { SANITY_PIPES_SLUG } from "@/lib/sanity/constants";
import type { SanityManageProject } from "@/lib/sanity/types";

import { IntegrationLogo } from "./integration-logo";
import { CollapsibleIntegrationRow } from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { pipesConnectionPanelMessages } from "./pipes-connection-panel.messages";
import { sanityConnectionPanelMessages } from "./sanity-connection-panel.messages";
import { usePipesStatus } from "./pipes-connection-panel";

import "@radix-ui/themes/styles.css";
import "@workos-inc/widgets/styles.css";

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
  const { getAccessToken, loading: accessTokenLoading } = useAccessToken();
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
  const showConnectedDetails = isConnected && !needsReauthorization;

  const projectsQuery = useQuery({
    queryKey: ["sanity-projects", organizationSlug],
    enabled: expanded && showConnectedDetails,
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

  async function resolvePipesAuthToken() {
    const token = await getAccessToken();
    if (!token) {
      throw new Error(
        intl.formatMessage(pipesConnectionPanelMessages.tokenRequired, { providerName }),
      );
    }
    return token;
  }

  const oauthConnect = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"][
        "authorize-url"
      ].$get({
        param: { organizationSlug, provider: SANITY_PIPES_SLUG },
      });
      const body = (await response.json().catch(() => null)) as {
        url?: unknown;
        message?: unknown;
      } | null;
      if (!response.ok) {
        const serverMessage =
          typeof body?.message === "string" && body.message.trim().length > 0 ? body.message : null;
        throw new Error(
          serverMessage ??
            intl.formatMessage(sanityConnectionPanelMessages.authorizeUrlFailedToast),
        );
      }
      if (typeof body?.url !== "string" || body.url.trim().length === 0) {
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

  const rowIcon = useMemo(() => {
    if (summary?.logoSrc) {
      return <IntegrationLogo src={summary.logoSrc} muted={!isConnected} />;
    }
    if (summary?.icon) {
      return <SimpleBrandIcon icon={summary.icon} colored={isConnected} />;
    }
    return null;
  }, [summary?.logoSrc, summary?.icon, isConnected]);

  const description = statusQuery.isError
    ? intl.formatMessage(sanityConnectionPanelMessages.loadErrorDescription)
    : needsReauthorization
      ? intl.formatMessage(pipesConnectionPanelMessages.reconnectHint, { providerName })
      : (summary?.detail ?? "");

  return (
    <CollapsibleIntegrationRow
      name={providerName}
      description={description}
      icon={rowIcon}
      isConnected={isConnected}
      userIsAdmin={userCanManage}
      expanded={expanded}
      onExpandedChange={setExpanded}
      isLoading={statusQuery.isLoading || accessTokenLoading}
      isLast={isLast}
    >
      {statusQuery.isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : showConnectedDetails ? (
        <Rows spacing="2u">
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
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...sanityConnectionPanelMessages.connectMethodsIntro} />
          </TypographyP>
          <Box padding="1.5u" background="canvas" border="standard" borderRadius="standard">
            <Rows spacing="1u">
              <TypographyP size="small" weight="medium" tone="content">
                <FormattedMessage {...sanityConnectionPanelMessages.oauthSectionTitle} />
              </TypographyP>
              <TypographyP size="xsmall" tone="subtle">
                <FormattedMessage {...sanityConnectionPanelMessages.oauthSectionDescription} />
              </TypographyP>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => oauthConnect.mutate()}
                disabled={oauthConnect.isPending}
              >
                {oauthConnect.isPending ? (
                  <FormattedMessage {...sanityConnectionPanelMessages.oauthConnectingButton} />
                ) : (
                  <FormattedMessage {...sanityConnectionPanelMessages.oauthConnectButton} />
                )}
                <ArrowUpRightIcon className="size-3.5" />
              </Button>
            </Rows>
          </Box>
          <TypographyMuted className="text-center text-xs">
            <FormattedMessage {...sanityConnectionPanelMessages.connectMethodDivider} />
          </TypographyMuted>
          <Box padding="1.5u" background="canvas" border="standard" borderRadius="standard">
            <Rows spacing="1u">
              <TypographyP size="small" weight="medium" tone="content">
                <FormattedMessage {...sanityConnectionPanelMessages.apiTokenSectionTitle} />
              </TypographyP>
              <TypographyP size="xsmall" tone="subtle">
                <FormattedMessage {...sanityConnectionPanelMessages.apiTokenSectionDescription} />
              </TypographyP>
              <WorkOsWidgets queryClient={queryClient}>
                <Pipes authToken={resolvePipesAuthToken} filter={{ slugs: [SANITY_PIPES_SLUG] }} />
              </WorkOsWidgets>
            </Rows>
          </Box>
        </Rows>
      )}
    </CollapsibleIntegrationRow>
  );
}
