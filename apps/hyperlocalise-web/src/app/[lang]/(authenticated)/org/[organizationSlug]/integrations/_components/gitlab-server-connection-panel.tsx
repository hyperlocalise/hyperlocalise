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
import { EyeIcon, EyeSlashIcon, FloppyDiskIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { siGitlab } from "simple-icons";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createApiClient } from "@/lib/api-client";
import { readApiError } from "@/lib/api-error";

import { gitlabServerConnectionPanelMessages as messages } from "./gitlab-server-connection-panel.messages";
import { CollapsibleIntegrationRow } from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { gitlabConnectionsQueryKey, useGitLabConnections } from "./use-gitlab-server-connection";

const api = createApiClient();
const GITLAB_COM_SERVER_URL = "https://gitlab.com";

type GitLabHost = "gitlab.com" | "server";

type GitLabConnection = NonNullable<ReturnType<typeof useGitLabConnections>["data"]>[number];

/** The form is open to add a connection, or to change one. */
type Editing = { mode: "add" } | { mode: "change"; connection: GitLabConnection };

function hostOf(serverUrl: string | null | undefined): GitLabHost {
  return !serverUrl || serverUrl === GITLAB_COM_SERVER_URL ? "gitlab.com" : "server";
}

function checkQueryKey(organizationSlug: string, connection: GitLabConnection) {
  return ["gitlab", organizationSlug, "connection-check", connection.id, connection.updatedAt];
}

/**
 * One connection's live check. Asked when the row opens, because a token can stop working at
 * any time after it was saved; kept while the row stays open and dropped when it closes.
 */
function ConnectionStatus({
  organizationSlug,
  connection,
  expanded,
}: {
  organizationSlug: string;
  connection: GitLabConnection;
  expanded: boolean;
}) {
  const queryClient = useQueryClient();
  const checkQuery = useQuery({
    queryKey: checkQueryKey(organizationSlug, connection),
    enabled: expanded,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async ({ signal }) => {
      const response = await api.api.orgs[":organizationSlug"].gitlab.connections[
        ":connectionId"
      ].check.$get(
        { param: { organizationSlug, connectionId: connection.id } },
        { init: { signal } },
      );
      if (response.status === 404) {
        // Removed elsewhere since this page loaded.
        await queryClient.invalidateQueries({
          queryKey: gitlabConnectionsQueryKey(organizationSlug),
        });
        return null;
      }
      if (!response.ok) {
        throw new Error("gitlab_connection_check_failed");
      }
      return response.json();
    },
  });
  const result = checkQuery.data;
  return (
    <p className="text-xs text-muted-foreground" role="status">
      {checkQuery.isFetching ? (
        <FormattedMessage {...messages.checking} />
      ) : checkQuery.isError ? (
        <FormattedMessage {...messages.checkUnavailable} />
      ) : result?.working === false ? (
        <FormattedMessage {...messages.checkFailed} values={{ reason: result.message }} />
      ) : result?.working ? (
        <FormattedMessage
          {...messages.checkPassed}
          values={{ suffix: connection.maskedTokenSuffix }}
        />
      ) : null}
    </p>
  );
}

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
  const nameFieldId = useId();
  const hostFieldId = useId();
  const serverUrlFieldId = useId();
  const tokenFieldId = useId();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [hostChoice, setHostChoice] = useState<GitLabHost | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const userCanManage = !disabled;
  const listKey = gitlabConnectionsQueryKey(organizationSlug);
  // The default is what the rest of the app reads as "the" connection.
  const refreshGitLabQueries = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey, exact: true }),
      queryClient.invalidateQueries({
        queryKey: ["gitlab", organizationSlug, "connection"],
        exact: true,
      }),
      queryClient.invalidateQueries({ queryKey: ["gitlab-projects", organizationSlug] }),
      queryClient.invalidateQueries({ queryKey: ["chat-repositories", organizationSlug] }),
    ]);

  const connectionsQuery = useGitLabConnections(organizationSlug);
  const connections = connectionsQuery.data ?? [];
  const defaultConnection = connections[0] ?? null;
  // Which connection chat and automations move to once this one is gone: the oldest remaining.
  const nextDefaultAfter = (connection: GitLabConnection) =>
    connections.find((candidate) => candidate.id !== connection.id) ?? null;
  const hostItems: { value: GitLabHost; label: string }[] = [
    { value: "gitlab.com", label: intl.formatMessage(messages.hostGitLabCom) },
    { value: "server", label: intl.formatMessage(messages.hostServer) },
  ];

  const clearForm = () => {
    setEditing(null);
    setName(null);
    setHostChoice(null);
    setServerUrl(null);
    setAccessToken("");
    setShowToken(false);
  };

  const changeExpanded = (open: boolean) => {
    setExpanded(open);
    if (!open) {
      setConfirmingRemove(null);
      // Stops checks still waiting on the servers; their answers would be thrown away anyway.
      void queryClient.cancelQueries({
        queryKey: ["gitlab", organizationSlug, "connection-check"],
      });
      queryClient.removeQueries({ queryKey: ["gitlab", organizationSlug, "connection-check"] });
    }
  };

  const save = useMutation({
    mutationFn: async (input: {
      connectionId: string | null;
      json: { name: string; serverUrl: string; accessToken: string };
    }) => {
      const response = input.connectionId
        ? await api.api.orgs[":organizationSlug"].gitlab.connections[":connectionId"].$put({
            param: { organizationSlug, connectionId: input.connectionId },
            json: input.json,
          })
        : await api.api.orgs[":organizationSlug"].gitlab.connections.$post({
            param: { organizationSlug },
            json: input.json,
          });
      if (!response.ok) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.saveFailed)));
      }
      const body = await response.json();
      return "gitlabConnection" in body ? body.gitlabConnection : null;
    },
    onSuccess: async (saved) => {
      clearForm();
      setConfirmingRemove(null);
      // Saving has just checked the connection, so the open row needn't check it again.
      if (saved) {
        queryClient.setQueryData(checkQueryKey(organizationSlug, saved), { working: true });
      }
      await refreshGitLabQueries();
      toast.success(intl.formatMessage(messages.saved));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.saveFailed));
    },
  });

  const makeDefault = useMutation({
    mutationFn: async (connection: GitLabConnection) => {
      const response = await api.api.orgs[":organizationSlug"].gitlab.connections[
        ":connectionId"
      ].default.$post({ param: { organizationSlug, connectionId: connection.id } });
      if (!response.ok) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.defaultFailed)));
      }
      return connection;
    },
    onSuccess: async (connection) => {
      await refreshGitLabQueries();
      toast.success(intl.formatMessage(messages.defaultSaved, { name: connection.name }));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.defaultFailed),
      );
    },
  });

  const remove = useMutation({
    mutationFn: async (connection: GitLabConnection) => {
      const response = await api.api.orgs[":organizationSlug"].gitlab.connections[
        ":connectionId"
      ].$delete({ param: { organizationSlug, connectionId: connection.id } });
      // Already removed elsewhere since this page loaded: the outcome is the same.
      if (!response.ok && response.status !== 404) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.removeFailed)));
      }
    },
    onSuccess: async (_removed, connection) => {
      setConfirmingRemove(null);
      // A Change form open for another connection keeps what was typed.
      if (editing?.mode === "change" && editing.connection.id === connection.id) {
        clearForm();
      }
      await refreshGitLabQueries();
      toast.success(intl.formatMessage(messages.removed));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.removeFailed),
      );
    },
  });

  const startChange = (connection: GitLabConnection) => {
    setEditing({ mode: "change", connection });
    setName(null);
    setHostChoice(null);
    setServerUrl(null);
    setAccessToken("");
    setShowToken(false);
    setConfirmingRemove(null);
  };

  // GitLab.com or a company's own server is an explicit choice, so a company token is never
  // sent to GitLab.com because an address was left as it was.
  // No host is assumed for a new connection: a token typed before the choice goes nowhere.
  // The live row, so the default-only warning follows a default that moved while the form was open.
  const changing =
    editing?.mode === "change"
      ? (connections.find((candidate) => candidate.id === editing.connection.id) ??
        editing.connection)
      : null;
  const savedHost = changing ? hostOf(changing.serverUrl) : null;
  const host = hostChoice ?? savedHost;
  const savedServerUrl = changing && savedHost === "server" ? changing.serverUrl : "";
  const serverUrlValue = serverUrl ?? savedServerUrl;
  // A connection saved before names starts with an empty field, its host as the placeholder,
  // so the host is never stored as a name that outlives a change of address.
  const nameValue = name ?? changing?.storedName ?? "";
  const namePlaceholder =
    changing && !changing.storedName ? changing.name : intl.formatMessage(messages.namePlaceholder);
  const serverUrlToSave =
    host === "gitlab.com" ? GITLAB_COM_SERVER_URL : host === "server" ? serverUrlValue.trim() : "";
  const busy = save.isPending || makeDefault.isPending || remove.isPending;
  // A failed load can't say what exists, so saving could overwrite a connection unwarned.
  const canEdit = userCanManage && !connectionsQuery.isError;
  const showForm = canEdit && editing !== null;
  const canSave =
    userCanManage && !busy && serverUrlToSave.length > 0 && accessToken.trim().length > 0;

  return (
    <CollapsibleIntegrationRow
      name={intl.formatMessage(messages.name)}
      description={
        connectionsQuery.isError
          ? intl.formatMessage(messages.loadError)
          : connections.length > 1 && defaultConnection
            ? intl.formatMessage(messages.connectionsDescription, {
                count: connections.length,
                name: defaultConnection.name,
              })
            : defaultConnection
              ? intl.formatMessage(messages.connectedDescription, {
                  serverUrl: defaultConnection.serverUrl,
                  username: defaultConnection.connectedUsername,
                })
              : intl.formatMessage(messages.description)
      }
      icon={<SimpleBrandIcon icon={siGitlab} colored={defaultConnection !== null} />}
      isConnected={defaultConnection !== null}
      userIsAdmin={userCanManage}
      expanded={expanded}
      onExpandedChange={changeExpanded}
      isLoading={connectionsQuery.isLoading}
      isLast={isLast}
    >
      <div className="grid gap-3">
        {connectionsQuery.isError ? null : connections.length === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">
            <FormattedMessage {...messages.intro} />
          </p>
        ) : (
          <ul className="grid gap-2">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="grid gap-1 rounded-md border border-border bg-background p-3"
                aria-label={connection.name}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{connection.name}</span>
                  {connection.isDefault ? (
                    <Badge variant="secondary">
                      <FormattedMessage {...messages.defaultBadge} />
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  <FormattedMessage
                    {...messages.connectedDescription}
                    values={{
                      serverUrl: connection.serverUrl,
                      username: connection.connectedUsername,
                    }}
                  />{" "}
                  {connection.syncCount > 0 ? (
                    <FormattedMessage
                      {...messages.usedBySyncs}
                      values={{ count: connection.syncCount }}
                    />
                  ) : null}
                </p>
                <ConnectionStatus
                  organizationSlug={organizationSlug}
                  connection={connection}
                  expanded={expanded}
                />
                {canEdit ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    {confirmingRemove === connection.id ? (
                      <>
                        <p className="basis-full text-end text-xs text-muted-foreground">
                          <FormattedMessage
                            {...messages.removeConfirm}
                            values={{ count: connection.syncCount }}
                          />{" "}
                          {connection.isDefault ? (
                            nextDefaultAfter(connection) ? (
                              <>
                                <FormattedMessage
                                  {...messages.removeDefaultNext}
                                  values={{ name: nextDefaultAfter(connection)?.name }}
                                />
                                {nextDefaultAfter(connection)?.serverUrl !==
                                connection.serverUrl ? (
                                  <>
                                    {" "}
                                    <FormattedMessage {...messages.removeDefaultOtherServer} />
                                  </>
                                ) : null}
                              </>
                            ) : (
                              <FormattedMessage {...messages.removeLast} />
                            )
                          ) : null}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => setConfirmingRemove(null)}
                        >
                          <FormattedMessage {...messages.cancel} />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={busy}
                          onClick={() => remove.mutate(connection)}
                        >
                          <FormattedMessage
                            {...(remove.isPending ? messages.removing : messages.removeNow)}
                          />
                        </Button>
                      </>
                    ) : (
                      <>
                        {connection.isDefault ? null : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => makeDefault.mutate(connection)}
                          >
                            <FormattedMessage {...messages.makeDefault} />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => startChange(connection)}
                        >
                          <FormattedMessage {...messages.change} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => setConfirmingRemove(connection.id)}
                        >
                          <FormattedMessage {...messages.remove} />
                        </Button>
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit && editing === null ? (
          <div className="grid gap-2">
            {connections.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                <FormattedMessage {...messages.addIntro} />
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button
                type="button"
                variant={connections.length > 0 ? "outline" : "default"}
                size="sm"
                disabled={busy}
                onClick={() => setEditing({ mode: "add" })}
              >
                <PlusIcon />
                <FormattedMessage {...messages.addConnection} />
              </Button>
            </div>
          </div>
        ) : null}
        {showForm ? (
          <form
            className="grid gap-3 rounded-md border border-border p-3"
            aria-label={intl.formatMessage(changing ? messages.change : messages.addConnection)}
            onSubmit={(event) => {
              event.preventDefault();
              if (canSave) {
                save.mutate({
                  connectionId: changing?.id ?? null,
                  json: { name: nameValue.trim(), serverUrl: serverUrlToSave, accessToken },
                });
              }
            }}
          >
            <Field>
              <FieldLabel htmlFor={nameFieldId}>
                <FormattedMessage {...messages.nameLabel} />
              </FieldLabel>
              <Input
                id={nameFieldId}
                autoComplete="off"
                maxLength={80}
                placeholder={namePlaceholder}
                value={nameValue}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                <FormattedMessage {...messages.nameHint} />
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor={hostFieldId}>
                <FormattedMessage {...messages.hostLabel} />
              </FieldLabel>
              <Select
                value={host ?? null}
                items={hostItems}
                disabled={busy}
                onValueChange={(value) => {
                  if (value === "gitlab.com" || value === "server") {
                    setHostChoice(value);
                  }
                }}
              >
                <SelectTrigger id={hostFieldId}>
                  <SelectValue placeholder={intl.formatMessage(messages.hostPlaceholder)} />
                </SelectTrigger>
                <SelectContent>
                  {hostItems.map((item) => (
                    <SelectItem key={item.value} value={item.value} label={item.label}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {host === "server" ? (
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
            ) : null}
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
              {host ? (
                <p className="text-xs text-muted-foreground">
                  <FormattedMessage
                    {...(changing && host === savedHost
                      ? messages.tokenReplaceHint
                      : host === "server"
                        ? messages.tokenHint
                        : messages.tokenHintGitLabCom)}
                  />
                </p>
              ) : null}
            </Field>
            {changing ? (
              <p className="text-xs text-muted-foreground">
                <FormattedMessage {...messages.replaceWarning} />
                {changing.isDefault ? (
                  <>
                    {" "}
                    <FormattedMessage {...messages.replaceWarningDefault} />
                  </>
                ) : null}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={clearForm}>
                <FormattedMessage {...messages.cancel} />
              </Button>
              <Button type="submit" disabled={!canSave}>
                <FloppyDiskIcon />
                <FormattedMessage {...(save.isPending ? messages.saving : messages.save)} />
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </CollapsibleIntegrationRow>
  );
}
