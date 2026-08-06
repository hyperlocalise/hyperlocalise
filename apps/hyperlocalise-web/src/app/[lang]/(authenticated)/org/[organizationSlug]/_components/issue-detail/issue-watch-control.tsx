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
import { Notification01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { issueWatchControlMessages as messages } from "./issue-watch-control.messages";
import { useIssueSubscriptionMutations } from "./use-issue-subscription";

const ghostSelectTriggerClassName =
  "h-8 w-full justify-start border-0 bg-transparent px-2 shadow-none hover:bg-muted/60";

export function IssueWatchControl({
  organizationSlug,
  projectId,
  issueId,
  isWatching,
  disabled = false,
}: {
  organizationSlug: string;
  projectId: string;
  issueId: string;
  isWatching: boolean;
  disabled?: boolean;
}) {
  const { watch, unwatch, isPending } = useIssueSubscriptionMutations({
    organizationSlug,
    projectId,
    issueId,
  });

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled || isPending}
      className={cn(ghostSelectTriggerClassName, isWatching && "text-foreground")}
      onClick={() => {
        if (isWatching) {
          unwatch.mutate();
          return;
        }
        watch.mutate();
      }}
    >
      <HugeiconsIcon
        icon={Notification01Icon}
        strokeWidth={1.8}
        data-icon="inline-start"
        className={cn(isWatching && "text-primary")}
      />
      <FormattedMessage {...(isWatching ? messages.watching : messages.notWatching)} />
    </Button>
  );
}
