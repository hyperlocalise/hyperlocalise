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
import { useState } from "react";
import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { Pipes, WorkOsWidgets } from "@workos-inc/widgets";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { AHREFS_PIPES_SLUG } from "@/lib/ahrefs/constants";
import type { AhrefsPipesConnectionStatus } from "@/lib/ahrefs/types";
import { createApiClient } from "@/lib/api-client";

import { ahrefsConnectionPanelMessages } from "./ahrefs-connection-panel.messages";
import { IntegrationLogo } from "./integration-logo";
import { CollapsibleIntegrationRow } from "./integration-row";

import "@radix-ui/themes/styles.css";
import "@workos-inc/widgets/styles.css";

const api = createApiClient();

export function useAhrefsPipesStatus(organizationSlug: string, refetchWhileOpen = false) {
  const intl = useIntl();

  return useQuery({
    queryKey: ["pipes", organizationSlug, AHREFS_PIPES_SLUG],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$get({
        param: { organizationSlug, provider: AHREFS_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(ahrefsConnectionPanelMessages.fetchFailed));
      }
      const body = await response.json();
      return body.pipe as AhrefsPipesConnectionStatus;
    },
    refetchInterval: refetchWhileOpen ? 5_000 : false,
  });
}

export function AhrefsConnectionPanel({
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
  const statusQuery = useAhrefsPipesStatus(organizationSlug, expanded);

  const isConnected = Boolean(statusQuery.data?.connected);
  const needsReauthorization = Boolean(statusQuery.data?.needsReauthorization);

  async function resolvePipesAuthToken() {
    const token = await getAccessToken();
    if (!token) {
      throw new Error(intl.formatMessage(ahrefsConnectionPanelMessages.tokenRequired));
    }
    return token;
  }

  return (
    <CollapsibleIntegrationRow
      name={intl.formatMessage(ahrefsConnectionPanelMessages.rowName)}
      description={intl.formatMessage(ahrefsConnectionPanelMessages.rowDescription)}
      icon={<IntegrationLogo src="/images/ahrefs-logo.svg" />}
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
            <FormattedMessage {...ahrefsConnectionPanelMessages.reconnectHint} />
          </p>
        ) : null}
        <WorkOsWidgets queryClient={queryClient}>
          <Pipes authToken={resolvePipesAuthToken} filter={{ slugs: [AHREFS_PIPES_SLUG] }} />
        </WorkOsWidgets>
      </div>
    </CollapsibleIntegrationRow>
  );
}
