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
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { Pipes, WorkOsWidgets } from "@workos-inc/widgets";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createApiClient } from "@/lib/api-client";
import {
  BRAZE_PIPES_SLUG,
  BRAZE_REST_ENDPOINTS,
  brazeRestEndpointOptionLabel,
  isBrazeRestEndpoint,
  type BrazeRestEndpoint,
} from "@/lib/braze/constants";
import { resolveWorkspaceIntegrationSummary } from "@/lib/integrations/workspace-integrations";

import { brazeConnectionPanelMessages } from "./braze-connection-panel.messages";
import { IntegrationLogo } from "./integration-logo";
import { CollapsibleIntegrationRow } from "./integration-row";
import { pipesConnectionPanelMessages } from "./pipes-connection-panel.messages";
import { usePipesStatus } from "./pipes-connection-panel";

import "@radix-ui/themes/styles.css";
import "@workos-inc/widgets/styles.css";

const api = createApiClient();

export function BrazeConnectionPanel({
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
  const [selectedEndpoint, setSelectedEndpoint] = useState<BrazeRestEndpoint | null>(null);
  const statusQuery = usePipesStatus(organizationSlug, BRAZE_PIPES_SLUG, expanded);
  const summary = useMemo(() => resolveWorkspaceIntegrationSummary(intl, BRAZE_PIPES_SLUG), [intl]);
  const providerName = summary?.name ?? "Braze";
  const isConnected = Boolean(statusQuery.data?.connected);
  const needsReauthorization = Boolean(statusQuery.data?.needsReauthorization);
  const wasConnectedRef = useRef(false);

  const settingsQuery = useQuery({
    queryKey: ["braze", organizationSlug],
    enabled: expanded && isConnected,
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].braze.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(brazeConnectionPanelMessages.loadFailed));
      }
      const body = await response.json();
      const restEndpoint =
        "braze" in body &&
        body.braze &&
        typeof body.braze === "object" &&
        "restEndpoint" in body.braze &&
        typeof body.braze.restEndpoint === "string" &&
        isBrazeRestEndpoint(body.braze.restEndpoint)
          ? body.braze.restEndpoint
          : null;
      return { restEndpoint };
    },
  });

  useEffect(() => {
    if (!settingsQuery.data?.restEndpoint) {
      return;
    }
    setSelectedEndpoint(settingsQuery.data.restEndpoint);
  }, [settingsQuery.data?.restEndpoint]);

  useEffect(() => {
    if (isConnected) {
      wasConnectedRef.current = true;
      return;
    }
    if (!wasConnectedRef.current) {
      return;
    }
    wasConnectedRef.current = false;
    setSelectedEndpoint(null);
    void api.api.orgs[":organizationSlug"].braze.$delete({ param: { organizationSlug } }).then(() =>
      queryClient.invalidateQueries({
        queryKey: ["braze", organizationSlug],
      }),
    );
  }, [isConnected, organizationSlug, queryClient]);

  const saveCluster = useMutation({
    mutationFn: async (restEndpoint: BrazeRestEndpoint) => {
      const response = await api.api.orgs[":organizationSlug"].braze.$put({
        param: { organizationSlug },
        json: { restEndpoint },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(brazeConnectionPanelMessages.saveFailed));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["braze", organizationSlug],
      });
      toast.success(intl.formatMessage(brazeConnectionPanelMessages.savedToast));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(brazeConnectionPanelMessages.saveFailed),
      );
    },
  });

  async function resolvePipesAuthToken() {
    const token = await getAccessToken();
    if (!token) {
      throw new Error(
        intl.formatMessage(pipesConnectionPanelMessages.tokenRequired, { providerName }),
      );
    }
    return token;
  }

  const savedEndpoint = settingsQuery.data?.restEndpoint ?? null;
  const canSave =
    !disabled &&
    isConnected &&
    selectedEndpoint != null &&
    selectedEndpoint !== savedEndpoint &&
    !saveCluster.isPending;

  return (
    <CollapsibleIntegrationRow
      name={providerName}
      description={summary?.detail ?? ""}
      icon={summary?.logoSrc ? <IntegrationLogo src={summary.logoSrc} /> : null}
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
          <Pipes authToken={resolvePipesAuthToken} filter={{ slugs: [BRAZE_PIPES_SLUG] }} />
        </WorkOsWidgets>
        {isConnected ? (
          <Field>
            <FieldLabel>
              <FormattedMessage {...brazeConnectionPanelMessages.clusterLabel} />
            </FieldLabel>
            <Select
              value={selectedEndpoint ?? undefined}
              disabled={disabled || saveCluster.isPending}
              onValueChange={(value) => {
                if (typeof value !== "string" || !isBrazeRestEndpoint(value)) {
                  return;
                }
                setSelectedEndpoint(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BRAZE_REST_ENDPOINTS.map((endpoint) => (
                  <SelectItem
                    key={endpoint}
                    value={endpoint}
                    label={brazeRestEndpointOptionLabel(endpoint)}
                  >
                    {brazeRestEndpointOptionLabel(endpoint)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <FormattedMessage {...brazeConnectionPanelMessages.clusterHint} />
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={!canSave}
              onClick={() => {
                if (selectedEndpoint) {
                  saveCluster.mutate(selectedEndpoint);
                }
              }}
            >
              {saveCluster.isPending ? (
                <FormattedMessage {...brazeConnectionPanelMessages.savingCluster} />
              ) : (
                <FormattedMessage {...brazeConnectionPanelMessages.saveCluster} />
              )}
            </Button>
          </Field>
        ) : (
          <p className="text-xs text-muted-foreground">
            <FormattedMessage {...brazeConnectionPanelMessages.connectKeyFirst} />
          </p>
        )}
      </div>
    </CollapsibleIntegrationRow>
  );
}
