"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
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
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { apiClient } from "@/lib/api-client-instance";

import { PageHeader } from "../../_components/workspace-resource-shared";
import { TypographyP } from "@/components/ui/typography";
import { apiKeysPageContentMessages } from "./api-keys-page-content.messages";

type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

const apiKeysQueryKey = (organizationSlug: string) => ["api-keys", organizationSlug];

function formatApiKeyDate(intl: IntlShape, date: string | null) {
  if (!date) {
    return intl.formatMessage(apiKeysPageContentMessages.neverUsed);
  }

  return intl.formatDate(new Date(date), {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ApiKeySettingsPageContent({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  const apiKeysQuery = useQuery({
    queryKey: apiKeysQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["api-keys"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(apiKeysPageContentMessages.loadFailed));
      }
      const body = await response.json();
      return (body.apiKeys ?? []) as ApiKey[];
    },
  });

  const createKey = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["api-keys"].$post({
        param: { organizationSlug },
        json: { name },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (body && typeof body === "object" && "error" in body) {
          throw new Error(String(body.error));
        }
        throw new Error(intl.formatMessage(apiKeysPageContentMessages.createFailed));
      }
      return response.json() as Promise<{
        apiKey: { id: string; name: string; key: string; keyPrefix: string };
      }>;
    },
    onSuccess: async (data) => {
      setCreatedKey(data.apiKey.key);
      setNewKeyName("");
      await queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(organizationSlug) });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const revokeKey = useMutation({
    mutationFn: async (apiKeyId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["api-keys"][
        ":apiKeyId"
      ].$delete({
        param: { organizationSlug, apiKeyId },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(apiKeysPageContentMessages.revokeFailed));
      }
    },
    onSuccess: async () => {
      setRevokingKeyId(null);
      await queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(organizationSlug) });
      toast.success(intl.formatMessage(apiKeysPageContentMessages.revokedToast));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  function handleCreateSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    createKey.mutate(newKeyName.trim());
  }

  function handleCopyKey(key: string) {
    navigator.clipboard
      .writeText(key)
      .then(() => {
        setCopied(true);
        toast.success(intl.formatMessage(apiKeysPageContentMessages.copiedToast));
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        toast.error(intl.formatMessage(apiKeysPageContentMessages.copyFailedToast));
      });
  }

  function handleCloseCreateDialog() {
    setIsCreateOpen(false);
    setCreatedKey(null);
    setCopied(false);
    setNewKeyName("");
  }

  const apiKeys = apiKeysQuery.data ?? [];
  const activeKeys = apiKeys.filter((k) => !k.revokedAt);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        icon={Key01Icon}
        label={intl.formatMessage(apiKeysPageContentMessages.pageLabel)}
        title={intl.formatMessage(apiKeysPageContentMessages.pageTitle)}
        description={intl.formatMessage(apiKeysPageContentMessages.pageDescription)}
        actions={
          <Button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="w-full sm:w-fit"
            disabled={createKey.isPending}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
            <FormattedMessage {...apiKeysPageContentMessages.createButton} />
          </Button>
        }
      />

      <section
        aria-label={intl.formatMessage(apiKeysPageContentMessages.sectionAriaLabel)}
        className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground"
      >
        {apiKeysQuery.isLoading ? (
          <TypographyP className="px-5 py-8 text-sm text-muted-foreground">
            <FormattedMessage {...apiKeysPageContentMessages.loading} />
          </TypographyP>
        ) : apiKeysQuery.isError ? (
          <div className="px-5 py-8">
            <TypographyP className="text-sm font-medium text-destructive">
              <FormattedMessage {...apiKeysPageContentMessages.loadErrorTitle} />
            </TypographyP>
            <TypographyP className="mt-1 text-sm text-muted-foreground">
              {apiKeysQuery.error instanceof Error
                ? apiKeysQuery.error.message
                : intl.formatMessage(apiKeysPageContentMessages.loadErrorFallback)}
            </TypographyP>
          </div>
        ) : activeKeys.length === 0 ? (
          <div className="px-5 py-10">
            <TypographyP className="text-sm font-medium text-foreground">
              <FormattedMessage {...apiKeysPageContentMessages.emptyTitle} />
            </TypographyP>
            <TypographyP className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              <FormattedMessage {...apiKeysPageContentMessages.emptyDescription} />
            </TypographyP>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {activeKeys.map((key) => (
              <div key={key.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <TypographyP className="text-sm font-medium text-foreground">
                      {key.name}
                    </TypographyP>
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                      <FormattedMessage
                        {...apiKeysPageContentMessages.maskedKeyPrefix}
                        values={{ prefix: key.keyPrefix }}
                      />
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      <FormattedMessage
                        {...apiKeysPageContentMessages.permissions}
                        values={{ permissions: key.permissions.join(", ") }}
                      />
                    </span>
                    <span>
                      <FormattedMessage
                        {...apiKeysPageContentMessages.createdAt}
                        values={{ date: formatApiKeyDate(intl, key.createdAt) }}
                      />
                    </span>
                    <span>
                      <FormattedMessage
                        {...apiKeysPageContentMessages.lastUsed}
                        values={{ date: formatApiKeyDate(intl, key.lastUsedAt) }}
                      />
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setRevokingKeyId(key.id)}
                  disabled={revokeKey.isPending}
                >
                  <HugeiconsIcon icon={Delete01Icon} strokeWidth={1.8} className="size-4" />
                  <FormattedMessage {...apiKeysPageContentMessages.revoke} />
                </Button>
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
              {createdKey ? (
                <FormattedMessage {...apiKeysPageContentMessages.createdDialogTitle} />
              ) : (
                <FormattedMessage {...apiKeysPageContentMessages.createDialogTitle} />
              )}
            </DialogTitle>
            <DialogDescription>
              {createdKey ? (
                <FormattedMessage {...apiKeysPageContentMessages.createdDialogDescription} />
              ) : (
                <FormattedMessage {...apiKeysPageContentMessages.createDialogDescription} />
              )}
            </DialogDescription>
          </DialogHeader>

          {createdKey ? (
            <div className="grid gap-4">
              <div className="relative">
                <Input readOnly value={createdKey} className="pr-24 font-mono text-sm" />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="absolute top-1/2 right-2 -translate-y-1/2"
                  onClick={() => handleCopyKey(createdKey)}
                >
                  {copied ? (
                    <>
                      <HugeiconsIcon icon={Tick02Icon} strokeWidth={1.8} className="size-4" />
                      <FormattedMessage {...apiKeysPageContentMessages.copied} />
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} className="size-4" />
                      <FormattedMessage {...apiKeysPageContentMessages.copy} />
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateSubmit} className="grid gap-4">
              <Field className="gap-2">
                <FieldLabel htmlFor="key-name">
                  <FormattedMessage {...apiKeysPageContentMessages.keyNameLabel} />
                </FieldLabel>
                <Input
                  id="key-name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder={intl.formatMessage(apiKeysPageContentMessages.keyNamePlaceholder)}
                />
              </Field>
            </form>
          )}

          <DialogFooter>
            {createdKey ? (
              <Button type="button" onClick={handleCloseCreateDialog} className="w-full sm:w-fit">
                <FormattedMessage {...apiKeysPageContentMessages.done} />
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseCreateDialog}
                  className="w-full sm:w-fit"
                >
                  <FormattedMessage {...apiKeysPageContentMessages.cancel} />
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateSubmit}
                  disabled={!newKeyName.trim() || createKey.isPending}
                  className="w-full sm:w-fit"
                >
                  {createKey.isPending ? (
                    <FormattedMessage {...apiKeysPageContentMessages.creating} />
                  ) : (
                    <FormattedMessage {...apiKeysPageContentMessages.createKey} />
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={revokingKeyId !== null}
        onOpenChange={(open) => !open && setRevokingKeyId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...apiKeysPageContentMessages.revokeDialogTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...apiKeysPageContentMessages.revokeDialogDescription} />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokingKeyId(null)}
              className="w-full sm:w-fit"
            >
              <FormattedMessage {...apiKeysPageContentMessages.cancel} />
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (revokingKeyId) revokeKey.mutate(revokingKeyId);
              }}
              disabled={revokeKey.isPending}
              className="w-full sm:w-fit"
            >
              {revokeKey.isPending ? (
                <FormattedMessage {...apiKeysPageContentMessages.revoking} />
              ) : (
                <FormattedMessage {...apiKeysPageContentMessages.revokeKey} />
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
