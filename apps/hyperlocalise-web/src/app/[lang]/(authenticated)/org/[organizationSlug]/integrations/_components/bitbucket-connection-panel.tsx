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
import { siBitbucket } from "simple-icons";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createApiClient } from "@/lib/api-client";
import { readApiError } from "@/lib/api-error";

import { bitbucketConnectionPanelMessages as messages } from "./bitbucket-connection-panel.messages";
import { CollapsibleIntegrationRow } from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { bitbucketConnectionsQueryKey, useBitbucketConnections } from "./use-bitbucket-connections";

const api = createApiClient();

type BitbucketConnection = NonNullable<ReturnType<typeof useBitbucketConnections>["data"]>[number];

/** The form is open to add a connection, or to change one. */
type Editing = { mode: "add" } | { mode: "change"; connection: BitbucketConnection };

function checkQueryKey(organizationSlug: string, connection: BitbucketConnection) {
  return ["bitbucket", organizationSlug, "connection-check", connection.id, connection.updatedAt];
}

/** One connection's live check, asked when the row opens: a token can stop working at any time. */
function ConnectionStatus({
  organizationSlug,
  connection,
  expanded,
}: {
  organizationSlug: string;
  connection: BitbucketConnection;
  expanded: boolean;
}) {
  const queryClient = useQueryClient();
  const checkQuery = useQuery({
    queryKey: checkQueryKey(organizationSlug, connection),
    enabled: expanded,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async ({ signal }) => {
      const response = await api.api.orgs[":organizationSlug"].bitbucket.connections[
        ":connectionId"
      ].check.$get(
        { param: { organizationSlug, connectionId: connection.id } },
        { init: { signal } },
      );
      if (response.status === 404) {
        // Removed elsewhere since this page loaded.
        await queryClient.invalidateQueries({
          queryKey: bitbucketConnectionsQueryKey(organizationSlug),
        });
        return null;
      }
      if (!response.ok) {
        throw new Error("bitbucket_connection_check_failed");
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
        <>
          <FormattedMessage
            {...messages.checkPassed}
            values={{ suffix: connection.maskedTokenSuffix }}
          />
          {result.readsRepositories ? null : (
            <>
              {" "}
              <span className="text-destructive">
                <FormattedMessage {...messages.tokenReadsNothing} />
              </span>
            </>
          )}
        </>
      ) : null}
    </p>
  );
}

function ConnectionAccount({ connection }: { connection: BitbucketConnection }) {
  const account = connection.connectedAccount ?? connection.accountEmail;
  return account ? (
    <FormattedMessage {...messages.connectedDescription} values={{ account }} />
  ) : (
    <FormattedMessage {...messages.connectedAccessToken} />
  );
}

export function BitbucketConnectionPanel({
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
  const emailFieldId = useId();
  const tokenFieldId = useId();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const userCanManage = !disabled;
  const listKey = bitbucketConnectionsQueryKey(organizationSlug);
  const refresh = () => queryClient.invalidateQueries({ queryKey: listKey, exact: true });

  const connectionsQuery = useBitbucketConnections(organizationSlug);
  const connections = connectionsQuery.data ?? [];
  const defaultConnection = connections[0] ?? null;

  const clearForm = () => {
    setEditing(null);
    setName(null);
    setAccountEmail(null);
    setAccessToken("");
    setShowToken(false);
  };

  const changeExpanded = (open: boolean) => {
    setExpanded(open);
    if (!open) {
      setConfirmingRemove(null);
      const checks = ["bitbucket", organizationSlug, "connection-check"];
      void queryClient.cancelQueries({ queryKey: checks });
      queryClient.removeQueries({ queryKey: checks });
    }
  };

  const save = useMutation({
    mutationFn: async (input: {
      connectionId: string | null;
      json: { name: string; accountEmail: string; accessToken: string };
    }) => {
      const response = input.connectionId
        ? await api.api.orgs[":organizationSlug"].bitbucket.connections[":connectionId"].$put({
            param: { organizationSlug, connectionId: input.connectionId },
            json: input.json,
          })
        : await api.api.orgs[":organizationSlug"].bitbucket.connections.$post({
            param: { organizationSlug },
            json: input.json,
          });
      if (!response.ok) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.saveFailed)));
      }
      const body = await response.json();
      return "bitbucketConnection" in body
        ? { connection: body.bitbucketConnection, check: body.check }
        : null;
    },
    onSuccess: async (saved) => {
      clearForm();
      setConfirmingRemove(null);
      // Saving has just checked the connection, so the open row needn't check it again.
      if (saved) {
        queryClient.setQueryData(checkQueryKey(organizationSlug, saved.connection), {
          working: true,
          ...saved.check,
        });
      }
      await refresh();
      toast.success(intl.formatMessage(messages.saved));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.saveFailed));
    },
  });

  const makeDefault = useMutation({
    mutationFn: async (connection: BitbucketConnection) => {
      const response = await api.api.orgs[":organizationSlug"].bitbucket.connections[
        ":connectionId"
      ].default.$post({ param: { organizationSlug, connectionId: connection.id } });
      if (!response.ok) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.defaultFailed)));
      }
      return connection;
    },
    onSuccess: async (connection) => {
      await refresh();
      toast.success(intl.formatMessage(messages.defaultSaved, { name: connection.name }));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.defaultFailed),
      );
    },
  });

  const remove = useMutation({
    mutationFn: async (connection: BitbucketConnection) => {
      const response = await api.api.orgs[":organizationSlug"].bitbucket.connections[
        ":connectionId"
      ].$delete({ param: { organizationSlug, connectionId: connection.id } });
      // Already removed elsewhere since this page loaded: the outcome is the same.
      if (!response.ok && response.status !== 404) {
        throw new Error(await readApiError(response, intl.formatMessage(messages.removeFailed)));
      }
    },
    onSuccess: async (_removed, connection) => {
      setConfirmingRemove(null);
      if (editing?.mode === "change" && editing.connection.id === connection.id) {
        clearForm();
      }
      await refresh();
      toast.success(intl.formatMessage(messages.removed));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.removeFailed),
      );
    },
  });

  const startChange = (connection: BitbucketConnection) => {
    clearForm();
    setEditing({ mode: "change", connection });
    setConfirmingRemove(null);
  };

  const changing = editing?.mode === "change" ? editing.connection : null;
  const nameValue = name ?? changing?.storedName ?? "";
  const emailValue = accountEmail ?? changing?.accountEmail ?? "";
  const busy = save.isPending || makeDefault.isPending || remove.isPending;
  // A failed load can't say what exists, so saving could overwrite a connection unwarned.
  const canEdit = userCanManage && !connectionsQuery.isError;
  const canSave = userCanManage && !busy && accessToken.trim().length > 0;

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
            : intl.formatMessage(messages.description)
      }
      icon={<SimpleBrandIcon icon={siBitbucket} colored={defaultConnection !== null} />}
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
                  <ConnectionAccount connection={connection} />{" "}
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
                          />
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
        {canEdit && editing !== null ? (
          <form
            className="grid gap-3 rounded-md border border-border p-3"
            aria-label={intl.formatMessage(changing ? messages.change : messages.addConnection)}
            onSubmit={(event) => {
              event.preventDefault();
              if (canSave) {
                save.mutate({
                  connectionId: changing?.id ?? null,
                  json: {
                    name: nameValue.trim(),
                    accountEmail: emailValue.trim(),
                    accessToken,
                  },
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
                placeholder={intl.formatMessage(messages.namePlaceholder)}
                value={nameValue}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                <FormattedMessage {...messages.nameHint} />
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor={emailFieldId}>
                <FormattedMessage {...messages.emailLabel} />
              </FieldLabel>
              <Input
                id={emailFieldId}
                type="email"
                autoComplete="off"
                maxLength={320}
                value={emailValue}
                disabled={busy}
                onChange={(event) => setAccountEmail(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                <FormattedMessage {...messages.emailHint} />
              </p>
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
                  {...(changing ? messages.tokenReplaceHint : messages.tokenHint)}
                />
              </p>
            </Field>
            {changing ? (
              <p className="text-xs text-muted-foreground">
                <FormattedMessage {...messages.replaceWarning} />
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
