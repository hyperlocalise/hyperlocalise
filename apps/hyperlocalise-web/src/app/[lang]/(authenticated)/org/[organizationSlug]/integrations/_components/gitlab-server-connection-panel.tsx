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
import { useId, useState } from "react";
import { EyeIcon, EyeSlashIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { siGitlab } from "simple-icons";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createApiClient } from "@/lib/api-client";
import { readApiError } from "@/lib/api-error";

import { gitlabServerConnectionPanelMessages as messages } from "./gitlab-server-connection-panel.messages";
import { CollapsibleIntegrationRow } from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { useGitLabServerConnection } from "./use-gitlab-server-connection";

const api = createApiClient();

export function GitLabServerConnectionPanel({
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
  const serverUrlFieldId = useId();
  const tokenFieldId = useId();
  const [expanded, setExpanded] = useState(false);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const userCanManage = !disabled;
  // Exact, so an open row's live check isn't run again under the connection's old save time.
  const refreshGitLabQueries = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["gitlab", organizationSlug, "connection"],
        exact: true,
      }),
      queryClient.invalidateQueries({ queryKey: ["gitlab-projects", organizationSlug] }),
      queryClient.invalidateQueries({ queryKey: ["chat-repositories", organizationSlug] }),
    ]);

  const connectionQuery = useGitLabServerConnection(organizationSlug);
  const connection = connectionQuery.data ?? null;

  // Asked when the row opens, because a token can stop working at any time after it was saved.
  // The answer is kept while the row stays open and dropped when it closes.
  const checkQueryKey = ["gitlab", organizationSlug, "connection", "check", connection?.updatedAt];
  const checkQuery = useQuery({
    queryKey: checkQueryKey,
    enabled: expanded && connection !== null,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].gitlab.connection.check.$get({
        param: { organizationSlug },
      });
      if (response.status === 404) {
        // Removed elsewhere since this page loaded.
        await queryClient.invalidateQueries({
          queryKey: ["gitlab", organizationSlug, "connection"],
          exact: true,
        });
        return null;
      }
      if (!response.ok) {
        throw new Error("gitlab_connection_check_failed");
      }
      return response.json();
    },
  });

  const changeExpanded = (open: boolean) => {
    setExpanded(open);
    if (!open) {
      setConfirmingDisconnect(false);
      queryClient.removeQueries({ queryKey: ["gitlab", organizationSlug, "connection", "check"] });
    }
  };

  const clearForm = () => {
    setServerUrl(null);
    setAccessToken("");
    setShowToken(false);
  };

  const save = useMutation({
    mutationFn: async (json: { serverUrl: string; accessToken: string }) => {
      const response = await api.api.orgs[":organizationSlug"].gitlab.connection.$put({
        param: { organizationSlug },
        json,
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.saveFailed)));
      }
      const body = await response.json();
      return "gitlabConnection" in body ? body.gitlabConnection : null;
    },
    onSuccess: async (saved) => {
      clearForm();
      setConfirmingDisconnect(false);
      // Saving has just checked the connection, so the open row needn't check it again.
      if (saved) {
        queryClient.setQueryData(
          ["gitlab", organizationSlug, "connection", "check", saved.updatedAt],
          { working: true },
        );
      }
      await refreshGitLabQueries();
      toast.success(intl.formatMessage(messages.saved));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.saveFailed));
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].gitlab.connection.$delete({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.disconnectFailed));
      }
    },
    onSuccess: async () => {
      clearForm();
      changeExpanded(false);
      await refreshGitLabQueries();
      toast.success(intl.formatMessage(messages.disconnected));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.disconnectFailed),
      );
    },
  });

  const serverUrlValue = serverUrl ?? connection?.serverUrl ?? "";
  const busy = save.isPending || disconnect.isPending;
  // A failed load can't say whether a connection exists, so saving could overwrite one unwarned.
  const showForm = userCanManage && !connectionQuery.isError;
  const canSave =
    userCanManage && !busy && serverUrlValue.trim().length > 0 && accessToken.trim().length > 0;
  const checkResult = checkQuery.data;

  return (
    <CollapsibleIntegrationRow
      name={intl.formatMessage(messages.name)}
      description={
        connectionQuery.isError
          ? intl.formatMessage(messages.loadError)
          : connection
            ? intl.formatMessage(messages.connectedDescription, {
                serverUrl: connection.serverUrl,
                username: connection.connectedUsername,
              })
            : intl.formatMessage(messages.description)
      }
      icon={<SimpleBrandIcon icon={siGitlab} colored={connection !== null} />}
      isConnected={connection !== null}
      userIsAdmin={userCanManage}
      expanded={expanded}
      onExpandedChange={changeExpanded}
      isLoading={connectionQuery.isLoading}
      isLast={isLast}
    >
      <div className="grid gap-3">
        {connectionQuery.isError ? null : connection ? (
          <p className="text-xs text-muted-foreground" role="status">
            {checkQuery.isFetching ? (
              <FormattedMessage {...messages.checking} />
            ) : checkQuery.isError ? (
              <FormattedMessage {...messages.checkUnavailable} />
            ) : checkResult?.working === false ? (
              <FormattedMessage
                {...messages.checkFailed}
                values={{ reason: checkResult.message }}
              />
            ) : checkResult?.working ? (
              <FormattedMessage
                {...messages.checkPassed}
                values={{ suffix: connection.maskedTokenSuffix }}
              />
            ) : null}
          </p>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            <FormattedMessage {...messages.intro} />
          </p>
        )}
        {showForm ? (
          <>
            <Field>
              <FieldLabel htmlFor={serverUrlFieldId}>
                <FormattedMessage {...messages.serverUrlLabel} />
              </FieldLabel>
              <Input
                id={serverUrlFieldId}
                type="url"
                autoComplete="off"
                placeholder="https://gitlab.example.com"
                value={serverUrlValue}
                disabled={busy}
                onChange={(event) => setServerUrl(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={tokenFieldId}>
                <FormattedMessage {...messages.tokenLabel} />
              </FieldLabel>
              <div className="relative">
                <Input
                  id={tokenFieldId}
                  type={showToken ? "text" : "password"}
                  autoComplete="off"
                  value={accessToken}
                  disabled={busy}
                  onChange={(event) => setAccessToken(event.target.value)}
                  className="pe-9"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((current) => !current)}
                  disabled={busy}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  aria-label={intl.formatMessage(
                    showToken ? messages.hideToken : messages.showToken,
                  )}
                >
                  {showToken ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                <FormattedMessage
                  {...(connection ? messages.tokenReplaceHint : messages.tokenHint)}
                />
              </p>
            </Field>
            {connection ? (
              <p className="text-xs text-muted-foreground">
                <FormattedMessage {...messages.replaceWarning} />
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              {connection && confirmingDisconnect ? (
                <>
                  <p className="basis-full text-end text-xs text-muted-foreground">
                    <FormattedMessage {...messages.disconnectConfirm} />
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setConfirmingDisconnect(false)}
                  >
                    <FormattedMessage {...messages.cancel} />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => disconnect.mutate()}
                  >
                    <FormattedMessage
                      {...(disconnect.isPending ? messages.disconnecting : messages.disconnectNow)}
                    />
                  </Button>
                </>
              ) : connection ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirmingDisconnect(true)}
                >
                  <FormattedMessage {...messages.disconnect} />
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={!canSave}
                onClick={() => save.mutate({ serverUrl: serverUrlValue, accessToken })}
              >
                <FloppyDiskIcon />
                <FormattedMessage {...(save.isPending ? messages.saving : messages.save)} />
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </CollapsibleIntegrationRow>
  );
}
