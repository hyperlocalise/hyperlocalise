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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

function isAlreadyLeft(error: unknown) {
  // go-svc refuses a caller who is no longer a member, for example after leaving in
  // another tab.
  return error instanceof GoSvcClientError && error.code === "organization_access_denied";
}

/** Loads what stops working when the person leaves, each time it opens. */
export function LeaveWorkspaceDialog({
  open,
  organizationSlug,
  organizationName,
  isOnlyWorkspace,
  onClose,
  onNavigateAway,
}: {
  open: boolean;
  organizationSlug: string;
  organizationName: string;
  isOnlyWorkspace: boolean;
  onClose: () => void;
  /** Called when a link in the dialog opens another page, such as Manage members. */
  onNavigateAway?: () => void;
}) {
  const { client } = useGoSvcClient();
  const queryClient = useQueryClient();

  const preview = useQuery({
    queryKey: leaveWorkspacePreviewQueryKey(organizationSlug),
    queryFn: () => client.member.leavePreview(organizationSlug),
    enabled: open,
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
        if (!isAlreadyLeft(error)) {
          throw error;
        }
      }
      // The person has left; from here on only where they land can go wrong.
      let redirectTo = "/dashboard";
      try {
        ({ redirectTo } = await finishLeavingWorkspaceAction(organizationSlug));
      } catch {
        // The dashboard finds the person's next workspace on its own.
      }
      // A full load: memberships and the session cookie have changed under this page.
      window.location.assign(redirectTo);
    },
  });

  const isLastAdmin =
    preview.data?.blockedReason === "last_admin" || leave.error instanceof LastAdminError;
  // Lost access since the menu was opened, for example by leaving in another tab.
  const isNoLongerMember = isAlreadyLeft(preview.error);
  const isLeaving = leave.isPending || leave.isSuccess;
  const canLeave = isNoLongerMember || (Boolean(preview.data) && !preview.isFetching);
  const close = () => {
    if (isLeaving) {
      return;
    }
    leave.reset();
    // The next opening loads afresh instead of showing these lists first.
    queryClient.removeQueries({ queryKey: leaveWorkspacePreviewQueryKey(organizationSlug) });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent
        showCloseButton={!isLeaving}
        className="max-h-[min(85dvh,42rem)] overflow-y-auto border-border bg-background text-foreground sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} values={{ name: organizationName }} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.description} />
            {isOnlyWorkspace ? (
              <>
                {" "}
                <FormattedMessage {...messages.onlyWorkspace} />
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {preview.isPending ? (
            <p className="text-muted-foreground" role="status">
              <FormattedMessage {...messages.checking} />
            </p>
          ) : null}

          {isNoLongerMember ? (
            <p role="alert">
              <FormattedMessage {...messages.noLongerMember} />
            </p>
          ) : null}

          {preview.isError && !isNoLongerMember ? (
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
                  values={{ count: preview.data.apiKeyTotal }}
                />
              </p>
              <ul className="space-y-1 text-muted-foreground">
                {preview.data.apiKeys.map((key) => (
                  <li key={key.keyPrefix} className="flex min-w-0 gap-2">
                    <span className="min-w-0 truncate">{key.name}</span>
                    <code className="shrink-0 font-mono text-xs">{key.keyPrefix}…</code>
                  </li>
                ))}
                <MoreItems total={preview.data.apiKeyTotal} shown={preview.data.apiKeys.length} />
              </ul>
            </section>
          ) : null}

          {!isLastAdmin && preview.data && preview.data.automations.length > 0 ? (
            <section className="space-y-1.5">
              <p className="font-medium">
                <FormattedMessage
                  {...messages.automations}
                  values={{ count: preview.data.automationTotal }}
                />
              </p>
              <ul className="space-y-1 text-muted-foreground">
                {preview.data.automations.map((automation) => (
                  <li key={automation.id} className="truncate">
                    {automation.name}
                  </li>
                ))}
                <MoreItems
                  total={preview.data.automationTotal}
                  shown={preview.data.automations.length}
                />
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
          <Button type="button" variant="outline" disabled={isLeaving} onClick={close}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          {isLastAdmin ? (
            <Button
              nativeButton={false}
              render={<Link href={buildOrganizationPath(organizationSlug, "members")} />}
              onClick={() => {
                close();
                onNavigateAway?.();
              }}
            >
              <FormattedMessage {...messages.manageMembers} />
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={!canLeave || isLeaving}
              onClick={() => leave.mutate()}
            >
              <FormattedMessage
                {...(isLeaving
                  ? messages.leaving
                  : isNoLongerMember
                    ? messages.continue
                    : messages.leave)}
              />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoreItems({ total, shown }: { total: number; shown: number }) {
  if (total <= shown) {
    return null;
  }
  return (
    <li>
      <FormattedMessage {...messages.moreItems} values={{ count: total - shown }} />
    </li>
  );
}
