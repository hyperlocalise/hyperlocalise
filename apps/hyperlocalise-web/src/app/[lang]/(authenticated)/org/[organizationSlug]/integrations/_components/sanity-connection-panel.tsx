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
import { useEffect, useId, useMemo, useState } from "react";
import { ArrowUpRightIcon, EyeIcon, EyeSlashIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { buildAutomationsPath } from "@/components/app-shell/navigation-config";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { createApiClient } from "@/lib/api-client";
import { resolveWorkspaceIntegrationSummary } from "@/lib/integrations/workspace-integrations";
import {
  isPipesProviderConnectable,
  supportsPipesApiKey,
  supportsPipesOAuth,
} from "@/lib/pipes/availability";
import {
  isSanityAuthMode,
  SANITY_AUTH_MODE_API_TOKEN,
  SANITY_AUTH_MODE_OAUTH,
  type SanityAuthMode,
} from "@/lib/sanity/auth-mode";
import { SANITY_PIPES_SLUG } from "@/lib/sanity/constants";
import type { SanityManageProject } from "@/lib/sanity/types";

import { IntegrationLogo } from "./integration-logo";
import { CollapsibleIntegrationRow, IntegrationRowFrame } from "./integration-row";
import { integrationRowMessages } from "./integration-row.messages";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { pipesConnectionPanelMessages } from "./pipes-connection-panel.messages";
import { sanityConnectionPanelMessages } from "./sanity-connection-panel.messages";
import { usePipesProviderAvailability, usePipesStatus } from "./pipes-connection-panel";

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
  const authMethodFieldId = useId();
  const apiTokenFieldId = useId();
  const [expanded, setExpanded] = useState(false);
  const [authMode, setAuthMode] = useState<SanityAuthMode>(SANITY_AUTH_MODE_OAUTH);
  const [apiToken, setApiToken] = useState("");
  const [showApiToken, setShowApiToken] = useState(false);
  const availabilityQuery = usePipesProviderAvailability(organizationSlug, SANITY_PIPES_SLUG);
  const pipesAvailability = availabilityQuery.data;
  const pipesConnectable = pipesAvailability
    ? isPipesProviderConnectable(pipesAvailability)
    : false;
  const oauthSupported = pipesAvailability ? supportsPipesOAuth(pipesAvailability) : false;
  const apiKeySupported = pipesAvailability ? supportsPipesApiKey(pipesAvailability) : true;
  const shouldLoadPipesStatus = availabilityQuery.isSuccess;
  const statusQuery = usePipesStatus(
    organizationSlug,
    SANITY_PIPES_SLUG,
    expanded,
    shouldLoadPipesStatus,
  );
  const summary = useMemo(
    () => resolveWorkspaceIntegrationSummary(intl, SANITY_PIPES_SLUG),
    [intl],
  );
  const providerName = summary?.name ?? "Sanity";
  const userCanManage = !disabled;
  const showAuthMethodSelect = userCanManage && oauthSupported && apiKeySupported;
  const isConnected = Boolean(statusQuery.data?.connected);
  const needsReauthorization = Boolean(statusQuery.data?.needsReauthorization);
  const apiKeyLast4 = statusQuery.data?.apiKeyLast4 ?? null;
  const showConnectedDetails = isConnected && !needsReauthorization;
  const isOAuthConnected = showConnectedDetails && !apiKeyLast4;
  const isApiTokenConnected = showConnectedDetails && Boolean(apiKeyLast4);
  const effectiveAuthMode: SanityAuthMode =
    oauthSupported && apiKeySupported
      ? authMode
      : !oauthSupported && apiKeySupported
        ? SANITY_AUTH_MODE_API_TOKEN
        : oauthSupported && !apiKeySupported
          ? SANITY_AUTH_MODE_OAUTH
          : authMode;
  const isOAuthMode = effectiveAuthMode === SANITY_AUTH_MODE_OAUTH;
  const isApiTokenMode = effectiveAuthMode === SANITY_AUTH_MODE_API_TOKEN;
  const trimmedApiToken = apiToken.trim();
  const authModeLabel = isOAuthMode
    ? intl.formatMessage(sanityConnectionPanelMessages.oauthMethodOption)
    : intl.formatMessage(sanityConnectionPanelMessages.apiTokenMethodOption);
  const showComingSoon =
    availabilityQuery.isSuccess && !pipesConnectable && !isConnected && !statusQuery.isLoading;

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

  useEffect(() => {
    if (!expanded) {
      return;
    }
    if (apiKeyLast4) {
      setAuthMode(SANITY_AUTH_MODE_API_TOKEN);
    } else if (showConnectedDetails && oauthSupported) {
      setAuthMode(SANITY_AUTH_MODE_OAUTH);
    } else if (!oauthSupported && apiKeySupported) {
      setAuthMode(SANITY_AUTH_MODE_API_TOKEN);
    }
  }, [expanded, apiKeyLast4, showConnectedDetails, oauthSupported, apiKeySupported]);

  useEffect(() => {
    if (!availabilityQuery.isSuccess) {
      return;
    }
    if (!oauthSupported && authMode === SANITY_AUTH_MODE_OAUTH) {
      setAuthMode(SANITY_AUTH_MODE_API_TOKEN);
    }
  }, [availabilityQuery.isSuccess, oauthSupported, authMode]);

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

  const saveApiToken = useMutation({
    mutationFn: async (token: string) => {
      const response = await api.api.orgs[":organizationSlug"].sanity.$put({
        param: { organizationSlug },
        json: { apiToken: token },
      });
      const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
      if (!response.ok) {
        const serverMessage =
          typeof body?.message === "string" && body.message.trim().length > 0 ? body.message : null;
        throw new Error(
          serverMessage ?? intl.formatMessage(sanityConnectionPanelMessages.saveApiTokenFailed),
        );
      }
    },
    onSuccess: async () => {
      setApiToken("");
      setShowApiToken(false);
      await queryClient.invalidateQueries({
        queryKey: ["pipes", organizationSlug, SANITY_PIPES_SLUG],
      });
      toast.success(intl.formatMessage(sanityConnectionPanelMessages.saveApiTokenSucceeded));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(sanityConnectionPanelMessages.saveApiTokenFailed),
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
      setApiToken("");
      setShowApiToken(false);
      setAuthMode(SANITY_AUTH_MODE_OAUTH);
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

  const description = statusQuery.isError
    ? intl.formatMessage(sanityConnectionPanelMessages.loadErrorDescription)
    : needsReauthorization
      ? intl.formatMessage(pipesConnectionPanelMessages.reconnectHint, { providerName })
      : (summary?.detail ?? "");

  const canSaveApiToken =
    userCanManage &&
    apiKeySupported &&
    isApiTokenMode &&
    trimmedApiToken.length > 0 &&
    !saveApiToken.isPending;

  const rowIcon = useMemo(() => {
    if (summary?.logoSrc) {
      return <IntegrationLogo src={summary.logoSrc} muted={!isConnected} />;
    }
    if (summary?.icon) {
      return <SimpleBrandIcon icon={summary.icon} colored={isConnected} />;
    }
    return null;
  }, [summary?.logoSrc, summary?.icon, isConnected]);

  if (availabilityQuery.isLoading || (shouldLoadPipesStatus && statusQuery.isLoading)) {
    return (
      <CollapsibleIntegrationRow
        name={providerName}
        description={summary?.detail ?? ""}
        icon={rowIcon}
        isConnected={false}
        userIsAdmin={userCanManage}
        expanded={false}
        onExpandedChange={() => {}}
        isLoading
        isLast={isLast}
      />
    );
  }

  if (showComingSoon) {
    return (
      <IntegrationRowFrame
        open={false}
        highlighted={false}
        icon={rowIcon}
        iconMuted
        name={providerName}
        description={intl.formatMessage(sanityConnectionPanelMessages.comingSoonDescription)}
        showPanel={false}
        action={
          <Button type="button" variant="outline" size="sm" disabled>
            <FormattedMessage {...integrationRowMessages.comingSoon} />
          </Button>
        }
      />
    );
  }

  return (
    <CollapsibleIntegrationRow
      name={providerName}
      description={description}
      icon={rowIcon}
      isConnected={isConnected}
      userIsAdmin={userCanManage}
      expanded={expanded}
      onExpandedChange={setExpanded}
      isLoading={statusQuery.isLoading}
      isLast={isLast}
    >
      {statusQuery.isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSaveApiToken) {
              saveApiToken.mutate(trimmedApiToken);
            }
          }}
        >
          {isOAuthConnected ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <p className="font-medium text-foreground">
                <FormattedMessage {...sanityConnectionPanelMessages.oauthConnectedTitle} />
              </p>
              <p className="leading-6 text-muted-foreground">
                <FormattedMessage {...sanityConnectionPanelMessages.oauthConnectedDescription} />
              </p>
            </div>
          ) : null}

          {isApiTokenConnected ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <p className="font-medium text-foreground">
                <FormattedMessage {...sanityConnectionPanelMessages.apiTokenConnectedTitle} />
              </p>
              <p className="leading-6 text-muted-foreground">
                {intl.formatMessage(sanityConnectionPanelMessages.tokenSuffix, {
                  suffix: apiKeyLast4 ?? "",
                })}
              </p>
              <p className="leading-6 text-muted-foreground">
                <FormattedMessage {...sanityConnectionPanelMessages.apiTokenConnectedDescription} />
              </p>
            </div>
          ) : null}

          {showConnectedDetails ? (
            <>
              <p className="text-sm leading-6 text-muted-foreground">
                <FormattedMessage {...sanityConnectionPanelMessages.connectedDescription} />
              </p>
              {projectsQuery.isLoading ? <Skeleton className="h-4 w-32" /> : null}
              {projects.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground">
                    <FormattedMessage {...sanityConnectionPanelMessages.projectsLabel} />
                  </p>
                  <ul className="space-y-0.5 text-sm text-foreground">
                    {projects.map((project) => (
                      <li key={project.id}>{project.displayName}</li>
                    ))}
                  </ul>
                </div>
              ) : projectsQuery.isSuccess ? (
                <p className="text-xs text-muted-foreground">
                  <FormattedMessage {...sanityConnectionPanelMessages.noProjects} />
                </p>
              ) : null}
            </>
          ) : null}

          {!showConnectedDetails || needsReauthorization || isApiTokenConnected ? (
            <>
              {needsReauthorization ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  <FormattedMessage
                    {...pipesConnectionPanelMessages.reconnectHint}
                    values={{ providerName }}
                  />
                </p>
              ) : null}

              {showAuthMethodSelect ? (
                <Field className="gap-2">
                  <FieldLabel htmlFor={authMethodFieldId}>
                    {intl.formatMessage(sanityConnectionPanelMessages.authenticationMethodLabel)}
                  </FieldLabel>
                  <FieldDescription>
                    <FormattedMessage
                      {...sanityConnectionPanelMessages.authenticationMethodDescription}
                    />
                  </FieldDescription>
                  <Select
                    value={authMode}
                    onValueChange={(value) => {
                      if (value != null && isSanityAuthMode(value)) {
                        setAuthMode(value);
                      }
                    }}
                  >
                    <SelectTrigger id={authMethodFieldId} className="h-9 w-full">
                      <SelectValue aria-label={authModeLabel}>{authModeLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {oauthSupported ? (
                        <SelectItem value={SANITY_AUTH_MODE_OAUTH}>
                          {intl.formatMessage(sanityConnectionPanelMessages.oauthMethodOption)}
                        </SelectItem>
                      ) : null}
                      {apiKeySupported ? (
                        <SelectItem value={SANITY_AUTH_MODE_API_TOKEN}>
                          {intl.formatMessage(sanityConnectionPanelMessages.apiTokenMethodOption)}
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}

              {isOAuthMode && oauthSupported && !isOAuthConnected ? (
                <>
                  <p className="text-sm leading-6 text-muted-foreground">
                    <FormattedMessage {...sanityConnectionPanelMessages.oauthConnectIntro} />
                  </p>
                  {userCanManage ? (
                    <Button
                      type="button"
                      onClick={() => oauthConnect.mutate()}
                      disabled={oauthConnect.isPending || !pipesConnectable}
                      className="w-fit"
                    >
                      {oauthConnect.isPending ? (
                        <FormattedMessage
                          {...sanityConnectionPanelMessages.oauthConnectingButton}
                        />
                      ) : (
                        <FormattedMessage {...sanityConnectionPanelMessages.oauthConnectButton} />
                      )}
                      <ArrowUpRightIcon className="size-3.5" />
                    </Button>
                  ) : null}
                </>
              ) : null}

              {isApiTokenMode && apiKeySupported ? (
                <>
                  {!isApiTokenConnected ? (
                    <p className="text-sm leading-6 text-muted-foreground">
                      <FormattedMessage {...sanityConnectionPanelMessages.apiTokenConnectIntro} />
                    </p>
                  ) : null}
                  <Field className="gap-2">
                    <FieldLabel htmlFor={apiTokenFieldId}>
                      {intl.formatMessage(sanityConnectionPanelMessages.apiTokenLabel)}
                    </FieldLabel>
                    <div className="relative">
                      <Input
                        id={apiTokenFieldId}
                        data-testid="sanity-api-token-input"
                        type={showApiToken ? "text" : "password"}
                        autoComplete="off"
                        value={apiToken}
                        disabled={!userCanManage || saveApiToken.isPending}
                        onChange={(event) => setApiToken(event.target.value)}
                        className="pe-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiToken((current) => !current)}
                        disabled={!userCanManage || saveApiToken.isPending}
                        className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                        aria-label={intl.formatMessage(
                          showApiToken
                            ? sanityConnectionPanelMessages.hideApiTokenAriaLabel
                            : sanityConnectionPanelMessages.showApiTokenAriaLabel,
                        )}
                      >
                        {showApiToken ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
                      </button>
                    </div>
                    <FieldDescription>
                      <FormattedMessage
                        {...(isApiTokenConnected
                          ? sanityConnectionPanelMessages.apiTokenRotateHint
                          : sanityConnectionPanelMessages.apiTokenHint)}
                      />
                    </FieldDescription>
                  </Field>
                </>
              ) : null}
            </>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {userCanManage && isConnected ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending || saveApiToken.isPending}
              >
                {disconnect.isPending ? (
                  <FormattedMessage {...sanityConnectionPanelMessages.disconnecting} />
                ) : (
                  <FormattedMessage {...sanityConnectionPanelMessages.disconnect} />
                )}
              </Button>
            ) : (
              <div />
            )}
            <div className="flex flex-wrap gap-2 sm:ms-auto">
              {showConnectedDetails ? (
                <Button
                  type="button"
                  variant="outline"
                  render={<Link href={buildAutomationsPath(organizationSlug)} />}
                >
                  <FormattedMessage {...sanityConnectionPanelMessages.openAutomations} />
                </Button>
              ) : null}
              {userCanManage && isApiTokenMode && apiKeySupported ? (
                <Button type="submit" disabled={!canSaveApiToken}>
                  <FloppyDiskIcon />
                  {saveApiToken.isPending ? (
                    <FormattedMessage {...sanityConnectionPanelMessages.savingApiToken} />
                  ) : (
                    <FormattedMessage {...sanityConnectionPanelMessages.saveApiToken} />
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        </form>
      )}
    </CollapsibleIntegrationRow>
  );
}
