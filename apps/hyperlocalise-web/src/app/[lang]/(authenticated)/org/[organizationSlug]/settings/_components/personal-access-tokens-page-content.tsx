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
import {
  Add01Icon,
  Copy01Icon,
  Delete01Icon,
  Key01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import type { ApiKeyPermission } from "@/api/routes/api-key/api-key.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";

import { PageHeader } from "../../_components/workspace-resource-shared";
import {
  ACCESS_TOKEN_PERMISSIONS,
  type AccessTokenSummary,
  formatAccessTokenDate,
  selectOwnedAccessTokens,
  toggleAccessTokenPermission,
} from "./access-token-lifecycle";
import { personalAccessTokensPageContentMessages as messages } from "./personal-access-tokens-page-content.messages";

const personalAccessTokensQueryKey = (organizationSlug: string) => [
  "personal-access-tokens",
  organizationSlug,
];

const permissionLabels = {
  "jobs:read": messages.permissionJobsRead,
  "jobs:write": messages.permissionJobsWrite,
  "files:read": messages.permissionFilesRead,
  "files:write": messages.permissionFilesWrite,
} as const;

export function PersonalAccessTokensPageContent({
  canManageTokens,
  currentUserId,
  organizationSlug,
}: {
  canManageTokens: boolean;
  currentUserId: string;
  organizationSlug: string;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<ApiKeyPermission[]>([
    ...ACCESS_TOKEN_PERMISSIONS,
  ]);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingToken, setRevokingToken] = useState<AccessTokenSummary | null>(null);

  const tokensQuery = useQuery({
    queryKey: personalAccessTokensQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["api-keys"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.loadFailed));
      }
      const body = await response.json();
      return selectOwnedAccessTokens(
        (body.apiKeys ?? []) as AccessTokenSummary[],
        currentUserId,
      );
    },
  });

  const createToken = useMutation({
    mutationFn: async ({
      name,
      permissions,
    }: {
      name: string;
      permissions: ApiKeyPermission[];
    }) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["api-keys"].$post({
        param: { organizationSlug },
        json: { name, permissions },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (body && typeof body === "object" && "error" in body) {
          throw new Error(String(body.error));
        }
        throw new Error(intl.formatMessage(messages.createFailed));
      }
      return response.json() as Promise<{
        apiKey: { id: string; name: string; key: string; keyPrefix: string };
      }>;
    },
    onSuccess: async (data) => {
      setCreatedToken(data.apiKey.key);
      setNewTokenName("");
      setSelectedPermissions([...ACCESS_TOKEN_PERMISSIONS]);
      await queryClient.invalidateQueries({
        queryKey: personalAccessTokensQueryKey(organizationSlug),
      });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const revokeToken = useMutation({
    mutationFn: async (apiKeyId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["api-keys"][
        ":apiKeyId"
      ].$delete({
        param: { organizationSlug, apiKeyId },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.revokeFailed));
      }
    },
    onSuccess: async () => {
      setRevokingToken(null);
      await queryClient.invalidateQueries({
        queryKey: personalAccessTokensQueryKey(organizationSlug),
      });
      toast.success(intl.formatMessage(messages.revokedToast));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  function handleCreateSubmit(event: React.SyntheticEvent) {
    event.preventDefault();
    if (!canManageTokens || !newTokenName.trim() || selectedPermissions.length === 0) {
      return;
    }
    createToken.mutate({
      name: newTokenName.trim(),
      permissions: selectedPermissions,
    });
  }

  function handleCopyToken(token: string) {
    navigator.clipboard
      .writeText(token)
      .then(() => {
        setCopied(true);
        toast.success(intl.formatMessage(messages.copiedToast));
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        toast.error(intl.formatMessage(messages.copyFailedToast));
      });
  }

  function handleCloseCreateDialog() {
    setIsCreateOpen(false);
    setCreatedToken(null);
    setCopied(false);
    setNewTokenName("");
    setSelectedPermissions([...ACCESS_TOKEN_PERMISSIONS]);
  }

  const tokens = tokensQuery.data ?? [];
  const neverUsedLabel = intl.formatMessage(messages.neverUsed);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        icon={Key01Icon}
        label={intl.formatMessage(messages.pageLabel)}
        title={intl.formatMessage(messages.pageTitle)}
        description={intl.formatMessage(messages.pageDescription)}
        descriptionDetail={intl.formatMessage(messages.pageDescriptionDetail)}
        actions={
          canManageTokens ? (
            <Button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="w-full sm:w-fit"
              disabled={createToken.isPending}
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
              <FormattedMessage {...messages.createButton} />
            </Button>
          ) : null
        }
      />

      <section
        aria-label={intl.formatMessage(messages.sectionAriaLabel)}
        className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground"
      >
        {tokensQuery.isLoading ? (
          <TypographyP className="px-5 py-8 text-sm text-muted-foreground">
            <FormattedMessage {...messages.loading} />
          </TypographyP>
        ) : tokensQuery.isError ? (
          <div className="px-5 py-8">
            <TypographyP className="text-sm font-medium text-destructive">
              <FormattedMessage {...messages.loadErrorTitle} />
            </TypographyP>
            <TypographyP className="mt-1 text-sm text-muted-foreground">
              {tokensQuery.error instanceof Error
                ? tokensQuery.error.message
                : intl.formatMessage(messages.loadErrorFallback)}
            </TypographyP>
          </div>
        ) : tokens.length === 0 ? (
          <div className="px-5 py-10">
            <TypographyP className="text-sm font-medium text-foreground">
              <FormattedMessage {...messages.emptyTitle} />
            </TypographyP>
            <TypographyP className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              <FormattedMessage {...messages.emptyDescription} />
            </TypographyP>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="flex items-start justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <TypographyP className="text-sm font-medium text-foreground">
                      {token.name}
                    </TypographyP>
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                      <FormattedMessage
                        {...messages.maskedKeyPrefix}
                        values={{ prefix: token.keyPrefix }}
                      />
                    </span>
                    {token.revokedAt ? (
                      <Badge variant="outline">
                        <FormattedMessage {...messages.revokedStatus} />
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      <FormattedMessage
                        {...messages.permissions}
                        values={{ permissions: token.permissions.join(", ") }}
                      />
                    </span>
                    <span>
                      <FormattedMessage
                        {...messages.createdAt}
                        values={{
                          date: formatAccessTokenDate(intl, token.createdAt, neverUsedLabel),
                        }}
                      />
                    </span>
                    <span>
                      <FormattedMessage
                        {...messages.lastUsed}
                        values={{
                          date: formatAccessTokenDate(intl, token.lastUsedAt, neverUsedLabel),
                        }}
                      />
                    </span>
                  </div>
                </div>
                {canManageTokens && !token.revokedAt ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setRevokingToken(token)}
                    disabled={revokeToken.isPending}
                  >
                    <HugeiconsIcon icon={Delete01Icon} strokeWidth={1.8} className="size-4" />
                    <FormattedMessage {...messages.revoke} />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseCreateDialog();
          else setIsCreateOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {createdToken ? (
                <FormattedMessage {...messages.createdDialogTitle} />
              ) : (
                <FormattedMessage {...messages.createDialogTitle} />
              )}
            </DialogTitle>
            <DialogDescription>
              {createdToken ? (
                <FormattedMessage {...messages.createdDialogDescription} />
              ) : (
                <FormattedMessage {...messages.createDialogDescription} />
              )}
            </DialogDescription>
          </DialogHeader>

          {createdToken ? (
            <div className="grid gap-4">
              <div className="relative">
                <Input
                  readOnly
                  value={createdToken}
                  className="pr-24 font-mono text-sm"
                  aria-label={intl.formatMessage(messages.createdDialogTitle)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="absolute top-1/2 right-2 -translate-y-1/2"
                  aria-label={intl.formatMessage(messages.copy)}
                  onClick={() => handleCopyToken(createdToken)}
                >
                  {copied ? (
                    <>
                      <HugeiconsIcon icon={Tick02Icon} strokeWidth={1.8} className="size-4" />
                      <FormattedMessage {...messages.copied} />
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} className="size-4" />
                      <FormattedMessage {...messages.copy} />
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateSubmit} className="grid gap-4">
              <Field className="gap-2">
                <FieldLabel htmlFor="token-name">
                  <FormattedMessage {...messages.tokenNameLabel} />
                </FieldLabel>
                <Input
                  id="token-name"
                  value={newTokenName}
                  onChange={(event) => setNewTokenName(event.target.value)}
                  placeholder={intl.formatMessage(messages.tokenNamePlaceholder)}
                />
              </Field>
              <FieldSet>
                <FieldLegend variant="label">
                  <FormattedMessage {...messages.permissionsLegend} />
                </FieldLegend>
                <div className="grid gap-3">
                  {ACCESS_TOKEN_PERMISSIONS.map((permission) => (
                    <Field key={permission} orientation="horizontal" className="items-center">
                      <Checkbox
                        id={`token-permission-${permission}`}
                        checked={selectedPermissions.includes(permission)}
                        onCheckedChange={(checked) => {
                          setSelectedPermissions((current) =>
                            toggleAccessTokenPermission(current, permission, checked === true),
                          );
                        }}
                      />
                      <FieldLabel htmlFor={`token-permission-${permission}`} className="font-normal">
                        <FormattedMessage {...permissionLabels[permission]} />
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              </FieldSet>
            </form>
          )}

          <DialogFooter>
            {createdToken ? (
              <Button type="button" onClick={handleCloseCreateDialog} className="w-full sm:w-fit">
                <FormattedMessage {...messages.done} />
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseCreateDialog}
                  className="w-full sm:w-fit"
                >
                  <FormattedMessage {...messages.cancel} />
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateSubmit}
                  disabled={
                    !canManageTokens ||
                    !newTokenName.trim() ||
                    selectedPermissions.length === 0 ||
                    createToken.isPending
                  }
                  className="w-full sm:w-fit"
                >
                  {createToken.isPending ? (
                    <FormattedMessage {...messages.creating} />
                  ) : (
                    <FormattedMessage {...messages.createToken} />
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={revokingToken !== null}
        onOpenChange={(open) => !open && setRevokingToken(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.revokeDialogTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage
                {...messages.revokeDialogDescription}
                values={{
                  name: revokingToken?.name ?? "",
                  prefix: revokingToken?.keyPrefix ?? "",
                }}
              />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokingToken(null)}
              className="w-full sm:w-fit"
            >
              <FormattedMessage {...messages.cancel} />
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (canManageTokens && revokingToken) {
                  revokeToken.mutate(revokingToken.id);
                }
              }}
              disabled={!canManageTokens || revokeToken.isPending}
              className="w-full sm:w-fit"
            >
              {revokeToken.isPending ? (
                <FormattedMessage {...messages.revoking} />
              ) : (
                <FormattedMessage {...messages.revokeToken} />
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
