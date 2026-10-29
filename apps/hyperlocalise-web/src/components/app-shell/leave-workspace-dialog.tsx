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
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FormattedMessage } from "react-intl";

import { finishLeavingWorkspaceAction } from "@/app/auth/leave-workspace/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-client";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { leaveWorkspaceDialogMessages as messages } from "./leave-workspace-dialog.messages";
import { buildOrganizationPath } from "./navigation-config";

export function leaveWorkspacePreviewQueryKey(organizationSlug: string) {
  return ["leave-workspace-preview", organizationSlug] as const;
}

class LastAdminError extends Error {}

/** Mounted only while open: it loads what stops working when the person leaves. */
export function LeaveWorkspaceDialog({
  organizationSlug,
  organizationName,
  onClose,
}: {
  organizationSlug: string;
  organizationName: string;
  onClose: () => void;
}) {
  const { client } = useGoSvcClient();

  const preview = useQuery({
    queryKey: leaveWorkspacePreviewQueryKey(organizationSlug),
    queryFn: () => client.member.leavePreview(organizationSlug),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const leave = useMutation({
    mutationFn: async () => {
      try {
        await client.member.leave(organizationSlug);
      } catch (error) {
        if (error instanceof GoSvcClientError && error.code === "last_admin_protected") {
          throw new LastAdminError("last_admin_protected", { cause: error });
        }
        throw error;
      }
      // Moves the session to another workspace and navigates there.
      await finishLeavingWorkspaceAction(organizationSlug);
    },
  });

  const isLastAdmin =
    preview.data?.blockedReason === "last_admin" || leave.error instanceof LastAdminError;
  const leaveDisabled = !preview.data || isLastAdmin || leave.isPending || leave.isSuccess;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !leave.isPending) {
          onClose();
        }
      }}
    >
      <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} values={{ name: organizationName }} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.description} />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {preview.isPending ? (
            <p className="text-muted-foreground" role="status">
              <FormattedMessage {...messages.checking} />
            </p>
          ) : null}

          {preview.isError ? (
            <div className="flex items-center justify-between gap-3" role="alert">
              <p className="text-destructive">
                <FormattedMessage {...messages.checkFailed} />
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => preview.refetch()}>
                <FormattedMessage {...messages.tryAgain} />
              </Button>
            </div>
          ) : null}

          {isLastAdmin ? (
            <p role="alert">
              <FormattedMessage {...messages.lastAdmin} />
            </p>
          ) : null}

          {!isLastAdmin && preview.data && preview.data.apiKeys.length > 0 ? (
            <section className="space-y-1.5">
              <p className="font-medium">
                <FormattedMessage
                  {...messages.apiKeys}
                  values={{ count: preview.data.apiKeys.length }}
                />
              </p>
              <ul className="space-y-1 text-muted-foreground">
                {preview.data.apiKeys.map((key) => (
                  <li key={key.keyPrefix} className="flex min-w-0 gap-2">
                    <span className="min-w-0 truncate">{key.name}</span>
                    <code className="shrink-0 font-mono text-xs">{key.keyPrefix}…</code>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!isLastAdmin && preview.data && preview.data.automations.length > 0 ? (
            <section className="space-y-1.5">
              <p className="font-medium">
                <FormattedMessage
                  {...messages.automations}
                  values={{ count: preview.data.automations.length }}
                />
              </p>
              <ul className="space-y-1 text-muted-foreground">
                {preview.data.automations.map((automation) => (
                  <li key={automation.id} className="truncate">
                    {automation.name}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {leave.isError && !(leave.error instanceof LastAdminError) ? (
            <p className="text-destructive" role="alert">
              <FormattedMessage {...messages.leaveFailed} />
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={leave.isPending} onClick={onClose}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          {isLastAdmin ? (
            <Button
              nativeButton={false}
              render={<Link href={buildOrganizationPath(organizationSlug, "members")} />}
              onClick={onClose}
            >
              <FormattedMessage {...messages.manageMembers} />
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={leaveDisabled}
              onClick={() => leave.mutate()}
            >
              <FormattedMessage {...(leave.isPending ? messages.leaving : messages.leave)} />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
