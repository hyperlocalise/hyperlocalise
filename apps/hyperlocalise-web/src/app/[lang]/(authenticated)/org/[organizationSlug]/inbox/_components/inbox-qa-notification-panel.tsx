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
import { WarningIcon } from "@phosphor-icons/react/ssr";
import { useIntl } from "react-intl";

import { buildProjectPath } from "@/components/app-shell/navigation-config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import type { InboxIssueNotification } from "./inbox-notifications-api";
import { inboxNotificationsMessages as messages } from "./inbox-notifications.messages";
import { formatRelativeTime } from "./inbox-types";

export function InboxQaNotificationPanel({
  notification,
  organizationSlug,
}: {
  notification: InboxIssueNotification;
  organizationSlug: string;
}) {
  const intl = useIntl();
  const failed = notification.type === "qa_scan_failed";
  const errorCount = notification.payload.errorCount ?? 0;

  return (
    <section
      aria-label={intl.formatMessage(messages.qaPanelLabel)}
      className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5"
    >
      <div className="flex max-w-xl flex-col gap-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              failed ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive",
            )}
          >
            <WarningIcon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-base font-medium text-pretty text-foreground">
              {notification.payload.issueTitle}
            </h2>
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage(
                failed ? messages.qaScanFailedType : messages.qaErrorsIncreasedType,
              )}
              {" · "}
              {formatRelativeTime(notification.createdAt, intl)}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1 text-sm leading-6 text-pretty text-foreground">
          {failed ? (
            <p>{intl.formatMessage(messages.qaPanelScanFailed)}</p>
          ) : (
            <>
              <p>
                {intl.formatMessage(messages.qaPanelErrorsIncreased, {
                  count: notification.payload.errorsChange ?? 0,
                })}
              </p>
              {errorCount > 0 ? (
                <p className="text-muted-foreground">
                  {intl.formatMessage(messages.qaPanelErrorTotal, { count: errorCount })}
                </p>
              ) : null}
            </>
          )}
        </div>
        <Button
          nativeButton={false}
          render={<Link href={buildProjectPath(organizationSlug, notification.projectId, "qa")} />}
          size="sm"
          variant="outline"
          className="w-fit"
        >
          {intl.formatMessage(messages.reviewQa)}
        </Button>
      </div>
    </section>
  );
}
