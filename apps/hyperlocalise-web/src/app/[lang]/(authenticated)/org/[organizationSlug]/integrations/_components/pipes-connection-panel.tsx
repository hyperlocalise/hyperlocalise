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
import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { Pipes, WorkOsWidgets } from "@workos-inc/widgets";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { createApiClient } from "@/lib/api-client";
import { resolveWorkspaceIntegrationSummary } from "@/lib/integrations/workspace-integrations";
import type { PipesProviderSlug } from "@/lib/pipes/providers";
import type { PipesConnectionStatus } from "@/lib/pipes/types";

import { IntegrationLogo } from "./integration-logo";
import { CollapsibleIntegrationRow } from "./integration-row";
import { pipesConnectionPanelMessages } from "./pipes-connection-panel.messages";
import { SimpleBrandIcon } from "./simple-brand-icon";

import "@radix-ui/themes/styles.css";
import "@workos-inc/widgets/styles.css";

const api = createApiClient();

export function usePipesStatus(
  organizationSlug: string,
  provider: PipesProviderSlug,
  refetchWhileOpen = false,
) {
  const intl = useIntl();
  const summary = useMemo(
    () => resolveWorkspaceIntegrationSummary(intl, provider),
    [intl, provider],
  );
  const providerName = summary?.name ?? provider;

  return useQuery({
    queryKey: ["pipes", organizationSlug, provider],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$get({
        param: { organizationSlug, provider },
      });
      if (!response.ok) {
        throw new Error(
          intl.formatMessage(pipesConnectionPanelMessages.fetchFailed, { providerName }),
        );
      }
      const body = await response.json();
      return body.pipe as PipesConnectionStatus;
    },
    refetchInterval: refetchWhileOpen ? 5_000 : false,
  });
}

export function PipesConnectionPanel({
  organizationSlug,
  provider,
  disabled,
  isLast = false,
}: {
  organizationSlug: string;
  provider: PipesProviderSlug;
  disabled?: boolean;
  isLast?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { getAccessToken, loading: accessTokenLoading } = useAccessToken();
  const [expanded, setExpanded] = useState(false);
  const statusQuery = usePipesStatus(organizationSlug, provider, expanded);
  const summary = useMemo(
    () => resolveWorkspaceIntegrationSummary(intl, provider),
    [intl, provider],
  );
  const providerName = summary?.name ?? provider;

  const isConnected = Boolean(statusQuery.data?.connected);
  const needsReauthorization = Boolean(statusQuery.data?.needsReauthorization);

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
      description={summary?.detail ?? ""}
      icon={
        summary?.logoSrc ? (
          <IntegrationLogo src={summary.logoSrc} />
        ) : summary?.icon ? (
          <SimpleBrandIcon icon={summary.icon} colored={isConnected} />
        ) : null
      }
      isConnected={isConnected}
      userIsAdmin={!disabled}
      expanded={expanded}
      onExpandedChange={setExpanded}
      isLoading={statusQuery.isLoading || accessTokenLoading}
      isLast={isLast}
    >
      <div className="flex flex-col gap-3">
        {needsReauthorization ? (
          <p className="text-xs text-muted-foreground">
            <FormattedMessage
              {...pipesConnectionPanelMessages.reconnectHint}
              values={{ providerName }}
            />
          </p>
        ) : null}
        <WorkOsWidgets queryClient={queryClient}>
          <Pipes authToken={resolvePipesAuthToken} filter={{ slugs: [provider] }} />
        </WorkOsWidgets>
      </div>
    </CollapsibleIntegrationRow>
  );
}
