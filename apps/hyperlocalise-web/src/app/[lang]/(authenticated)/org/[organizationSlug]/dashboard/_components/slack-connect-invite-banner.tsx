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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { isApiResponseErrorCode, readApiResponseError } from "@/lib/api-error";
import { createApiClient } from "@/lib/api-client";

import { IntegrationLogo } from "../../integrations/_components/integration-logo";
import { slackConnectInviteBannerMessages } from "./slack-connect-invite-banner.messages";

const api = createApiClient();

export type SlackConnectInviteState = {
  available: boolean;
  invited: boolean;
  dismissed: boolean;
  canManage: boolean;
  lastInvitedAt: string | null;
  invitedEmailMasked: string | null;
};

function slackConnectQueryKey(organizationSlug: string) {
  return ["slack-connect", organizationSlug] as const;
}

async function fetchSlackConnectInvite(organizationSlug: string): Promise<SlackConnectInviteState> {
  const response = await api.api.orgs[":organizationSlug"]["slack-connect"].$get({
    param: { organizationSlug },
  });
  if (!response.ok) {
    throw await readApiResponseError(response, "Failed to load Slack Connect invite");
  }

  const body = await response.json();
  return body.slackConnect;
}

export function SlackConnectInviteBannerView({
  invited,
  canManage = true,
  isRequesting = false,
  isDismissing = false,
  onDismiss,
  onRequest,
}: {
  invited: boolean;
  canManage?: boolean;
  isRequesting?: boolean;
  isDismissing?: boolean;
  onDismiss: () => void;
  onRequest: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col justify-between gap-5 rounded-2xl border border-border bg-card p-6 lg:w-[380px] lg:shrink-0">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
          <IntegrationLogo src="/images/slack-logo.svg" className="size-5" />
        </div>
        <div className="min-w-0">
          <TypographyP size="small" weight="medium" tone="content">
            {invited ? (
              <FormattedMessage {...slackConnectInviteBannerMessages.invitedTitle} />
            ) : (
              <FormattedMessage {...slackConnectInviteBannerMessages.createTitle} />
            )}
          </TypographyP>
          <TypographyP className="mt-1" size="small" tone="subtle">
            {invited ? (
              <FormattedMessage {...slackConnectInviteBannerMessages.invitedDescription} />
            ) : (
              <FormattedMessage {...slackConnectInviteBannerMessages.createDescription} />
            )}
          </TypographyP>
        </div>
      </div>
      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={isDismissing || isRequesting}
            onClick={onDismiss}
          >
            <FormattedMessage {...slackConnectInviteBannerMessages.dismiss} />
          </Button>
          <Button type="button" disabled={isRequesting || isDismissing} onClick={onRequest}>
            {isRequesting ? (
              <FormattedMessage {...slackConnectInviteBannerMessages.requesting} />
            ) : (
              <FormattedMessage {...slackConnectInviteBannerMessages.requestInvite} />
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function SlackConnectInviteBanner({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const queryKey = slackConnectQueryKey(organizationSlug);

  const inviteQuery = useQuery({
    queryKey,
    queryFn: () => fetchSlackConnectInvite(organizationSlug),
  });

  const requestMutation = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["slack-connect"].$post({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to request Slack invite");
      }
      const body = await response.json();
      return body.slackConnect as SlackConnectInviteState;
    },
    onSuccess: (slackConnect) => {
      queryClient.setQueryData(queryKey, slackConnect);
      toast.success(intl.formatMessage(slackConnectInviteBannerMessages.requestSuccess));
    },
    onError: (error) => {
      toast.error(
        intl.formatMessage(
          isApiResponseErrorCode(error, "slack_connect_rate_limited")
            ? slackConnectInviteBannerMessages.rateLimited
            : slackConnectInviteBannerMessages.requestFailed,
        ),
      );
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["slack-connect"].$patch({
        param: { organizationSlug },
        json: { dismissed: true },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to dismiss Slack invite");
      }
      const body = await response.json();
      return body.slackConnect as SlackConnectInviteState;
    },
    onSuccess: (slackConnect) => {
      queryClient.setQueryData(queryKey, slackConnect);
    },
    onError: () => {
      toast.error(intl.formatMessage(slackConnectInviteBannerMessages.dismissFailed));
    },
  });

  if (inviteQuery.isLoading) {
    return (
      <div
        className="flex h-full w-full flex-col gap-4 rounded-2xl border border-border bg-card p-6 lg:w-[380px] lg:shrink-0"
        aria-busy="true"
        aria-label={intl.formatMessage(slackConnectInviteBannerMessages.loadingLabel)}
      >
        <div className="flex items-start gap-3">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
    );
  }

  const slackConnect = inviteQuery.data;
  if (!slackConnect?.available || slackConnect.dismissed) {
    return null;
  }
  if (!slackConnect.canManage && !slackConnect.invited) {
    return null;
  }

  return (
    <SlackConnectInviteBannerView
      invited={slackConnect.invited}
      canManage={slackConnect.canManage}
      isRequesting={requestMutation.isPending}
      isDismissing={dismissMutation.isPending}
      onDismiss={() => {
        dismissMutation.mutate();
      }}
      onRequest={() => {
        requestMutation.mutate();
      }}
    />
  );
}
