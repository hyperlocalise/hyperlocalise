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
import { Delete02Icon, SaveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { siGitlab } from "simple-icons";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createApiClient } from "@/lib/api-client";
import type { GitLabConnectionSummary } from "@/lib/gitlab/types";

import { CollapsibleIntegrationRow } from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { gitlabSelfHostedPanelMessages } from "./gitlab-self-hosted-panel.messages";

const api = createApiClient();

type GitLabConnectionForm = {
  displayName: string;
  baseUrl: string;
  accessToken: string;
};

const emptyForm = (): GitLabConnectionForm => ({
  displayName: "",
  baseUrl: "",
  accessToken: "",
});

export function useGitLabConnections(organizationSlug: string) {
  const intl = useIntl();

  return useQuery({
    queryKey: ["gitlab-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["gitlab-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(gitlabSelfHostedPanelMessages.fetchFailed));
      }
      const body = await response.json();
      return body.gitlabConnections as GitLabConnectionSummary[];
    },
  });
}

export function GitLabSelfHostedPanel({
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
  const connectionsQuery = useGitLabConnections(organizationSlug);
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<GitLabConnectionForm>(emptyForm);

  const saveMutation = useMutation({
    mutationFn: async (payload: GitLabConnectionForm) => {
      const baseUrl = payload.baseUrl.trim();
      const accessToken = payload.accessToken.trim();
      if (!baseUrl) {
        throw new Error(intl.formatMessage(gitlabSelfHostedPanelMessages.baseUrlRequired));
      }
      if (!accessToken) {
        throw new Error(intl.formatMessage(gitlabSelfHostedPanelMessages.accessTokenRequired));
      }

      const response = await api.api.orgs[":organizationSlug"]["gitlab-connections"].$post({
        param: { organizationSlug },
        json: {
          displayName: payload.displayName.trim() || "Self-hosted GitLab",
          baseUrl,
          accessToken,
          enabled: true,
          validate: true,
        },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        throw new Error(
          body?.message || intl.formatMessage(gitlabSelfHostedPanelMessages.saveFailed),
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(gitlabSelfHostedPanelMessages.saveSucceeded));
      setAdding(false);
      setForm(emptyForm());
      await queryClient.invalidateQueries({ queryKey: ["gitlab-connections", organizationSlug] });
      await queryClient.invalidateQueries({ queryKey: ["gitlab-projects", organizationSlug] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(gitlabSelfHostedPanelMessages.saveFailed),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await api.api.orgs[":organizationSlug"]["gitlab-connections"][
        ":connectionId"
      ].$delete({
        param: { organizationSlug, connectionId },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        if (body?.error === "gitlab_connection_in_use") {
          throw new Error(intl.formatMessage(gitlabSelfHostedPanelMessages.deleteInUse));
        }
        throw new Error(
          body?.message || intl.formatMessage(gitlabSelfHostedPanelMessages.deleteFailed),
        );
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(gitlabSelfHostedPanelMessages.deleteSucceeded));
      await queryClient.invalidateQueries({ queryKey: ["gitlab-connections", organizationSlug] });
      await queryClient.invalidateQueries({ queryKey: ["gitlab-projects", organizationSlug] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(gitlabSelfHostedPanelMessages.deleteFailed),
      );
    },
  });

  const connections = connectionsQuery.data ?? [];
  const isConnected = connections.length > 0;
  const showForm = adding || connections.length === 0;

  function handleExpandedChange(nextExpanded: boolean) {
    setExpanded(nextExpanded);
    if (!nextExpanded) {
      setAdding(false);
      setForm(emptyForm());
      return;
    }
    if (connections.length === 0) {
      setAdding(true);
    }
  }

  return (
    <CollapsibleIntegrationRow
      name={intl.formatMessage(gitlabSelfHostedPanelMessages.rowName)}
      description={intl.formatMessage(gitlabSelfHostedPanelMessages.rowDescription)}
      icon={<SimpleBrandIcon icon={siGitlab} colored={isConnected} />}
      isConnected={isConnected}
      userIsAdmin={!disabled}
      expanded={expanded}
      onExpandedChange={handleExpandedChange}
      isLoading={connectionsQuery.isLoading}
      isLast={isLast}
    >
      <div className="flex flex-col gap-5">
        {connections.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-foreground">{connection.displayName}</div>
                  <p className="text-xs text-muted-foreground">
                    {intl.formatMessage(gitlabSelfHostedPanelMessages.tokenConfigured, {
                      baseUrl: connection.baseUrl,
                      suffix: connection.maskedAccessTokenSuffix,
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {connection.enabled ? (
                    <Badge variant="secondary">
                      <FormattedMessage {...gitlabSelfHostedPanelMessages.enabled} />
                    </Badge>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled || deleteMutation.isPending}
                    aria-label={intl.formatMessage(gitlabSelfHostedPanelMessages.delete)}
                    onClick={() => deleteMutation.mutate(connection.id)}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {isConnected && !adding ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => setAdding(true)}
            >
              <FormattedMessage {...gitlabSelfHostedPanelMessages.addConnection} />
            </Button>
          </div>
        ) : null}

        {showForm ? (
          <div className="grid gap-3">
            <Field>
              <FieldLabel>
                <FormattedMessage {...gitlabSelfHostedPanelMessages.displayNameLabel} />
              </FieldLabel>
              <Input
                value={form.displayName}
                disabled={disabled || saveMutation.isPending}
                onChange={(event) =>
                  setForm((current) => ({ ...current, displayName: event.currentTarget.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel>
                <FormattedMessage {...gitlabSelfHostedPanelMessages.baseUrlLabel} />
              </FieldLabel>
              <Input
                value={form.baseUrl}
                placeholder="https://gitlab.example.com"
                disabled={disabled || saveMutation.isPending}
                onChange={(event) =>
                  setForm((current) => ({ ...current, baseUrl: event.currentTarget.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                <FormattedMessage {...gitlabSelfHostedPanelMessages.baseUrlHelp} />
              </p>
            </Field>
            <Field>
              <FieldLabel>
                <FormattedMessage {...gitlabSelfHostedPanelMessages.accessTokenLabel} />
              </FieldLabel>
              <Input
                type="password"
                autoComplete="off"
                value={form.accessToken}
                disabled={disabled || saveMutation.isPending}
                onChange={(event) =>
                  setForm((current) => ({ ...current, accessToken: event.currentTarget.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                <FormattedMessage {...gitlabSelfHostedPanelMessages.accessTokenHelp} />
              </p>
            </Field>
            <div className="flex justify-end gap-2">
              {isConnected ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saveMutation.isPending}
                  onClick={() => {
                    setAdding(false);
                    setForm(emptyForm());
                  }}
                >
                  <FormattedMessage {...gitlabSelfHostedPanelMessages.cancel} />
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={disabled || saveMutation.isPending}
                onClick={() => saveMutation.mutate(form)}
              >
                <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} />
                <FormattedMessage {...gitlabSelfHostedPanelMessages.save} />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </CollapsibleIntegrationRow>
  );
}
