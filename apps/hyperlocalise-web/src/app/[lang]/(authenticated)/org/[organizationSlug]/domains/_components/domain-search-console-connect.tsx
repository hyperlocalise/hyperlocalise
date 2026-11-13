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
import { useEffect, useRef } from "react";
import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { Pipes, WorkOsWidgets } from "@workos-inc/widgets";
import { useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { GSC_PIPES_SLUG } from "@/lib/gsc/constants";
import { resolveWorkspaceIntegrationSummary } from "@/lib/integrations/workspace-integrations";

import { integrationRowMessages } from "../../integrations/_components/integration-row.messages";
import { pipesConnectionPanelMessages } from "../../integrations/_components/pipes-connection-panel.messages";
import { usePipesStatus } from "../../integrations/_components/pipes-connection-panel";
import { domainSearchConsoleViewMessages as messages } from "./domain-search-console-view.messages";

import "@radix-ui/themes/styles.css";
import "@workos-inc/widgets/styles.css";

export function DomainSearchConsoleConnect({
  organizationSlug,
  linkedDomainId,
  canManageConnection,
}: {
  organizationSlug: string;
  linkedDomainId: string;
  canManageConnection: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { getAccessToken, loading: accessTokenLoading } = useAccessToken();
  const statusQuery = usePipesStatus(organizationSlug, GSC_PIPES_SLUG, canManageConnection);
  const previousStatus = useRef<{ connected: boolean; needsReauthorization: boolean } | null>(null);
  const summary = resolveWorkspaceIntegrationSummary(intl, GSC_PIPES_SLUG);
  const providerName = summary?.name ?? "Google Search Console";

  useEffect(() => {
    const connected = Boolean(statusQuery.data?.connected);
    const needsReauthorization = Boolean(statusQuery.data?.needsReauthorization);
    const previous = previousStatus.current;
    previousStatus.current = { connected, needsReauthorization };

    if (!previous) {
      return;
    }

    const justConnected = !previous.connected && connected;
    const justReauthorized = previous.needsReauthorization && !needsReauthorization && connected;
    if (!justConnected && !justReauthorized) {
      return;
    }

    void queryClient.invalidateQueries({
      queryKey: ["domain-search-console", organizationSlug, linkedDomainId],
    });
  }, [
    linkedDomainId,
    organizationSlug,
    queryClient,
    statusQuery.data?.connected,
    statusQuery.data?.needsReauthorization,
  ]);

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
    <div className="grid w-full max-w-md justify-items-center gap-3">
      {canManageConnection ? (
        statusQuery.isLoading || accessTokenLoading ? (
          <Spinner className="size-4" />
        ) : (
          <div className="grid w-full gap-3">
            {statusQuery.data?.needsReauthorization ? (
              <TypographyP size="small" tone="subtle">
                <FormattedMessage
                  {...pipesConnectionPanelMessages.reconnectHint}
                  values={{ providerName }}
                />
              </TypographyP>
            ) : null}
            <WorkOsWidgets queryClient={queryClient}>
              <Pipes authToken={resolvePipesAuthToken} filter={{ slugs: [GSC_PIPES_SLUG] }} />
            </WorkOsWidgets>
          </div>
        )
      ) : (
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...integrationRowMessages.adminsCanConnect} />
        </TypographyP>
      )}
      <Button
        size="sm"
        variant="outline"
        render={<OrgNavLink href={`/org/${organizationSlug}/integrations`} />}
      >
        <FormattedMessage {...messages.manageCta} />
      </Button>
    </div>
  );
}
