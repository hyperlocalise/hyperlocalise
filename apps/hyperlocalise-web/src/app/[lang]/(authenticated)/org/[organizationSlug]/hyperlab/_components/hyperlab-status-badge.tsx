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
import { FormattedMessage } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/primitives/cn";

import { hyperlabMessages as messages } from "./hyperlab.messages";
import type { HyperlabExperiment } from "./hyperlab-api";
import { isScheduleExpired } from "./hyperlab-schedule";

const STATUS_MESSAGE = {
  draft: messages.statusDraft,
  active: messages.statusActive,
  archived: messages.statusArchived,
} as const;

export function HyperlabStatusBadge({
  status,
  endAt,
}: {
  status: HyperlabExperiment["status"];
  endAt?: string;
}) {
  const expired = endAt ? isScheduleExpired(endAt) && status !== "archived" : false;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge
        variant="outline"
        className={cn(
          status === "active" && "border-grove-700/25 bg-grove-100 text-grove-900",
          status === "draft" && "bg-muted text-subtle-foreground",
          status === "archived" && "border-destructive/25 bg-destructive/10 text-destructive",
        )}
      >
        <FormattedMessage {...STATUS_MESSAGE[status]} />
      </Badge>
      {expired ? (
        <Badge variant="destructive">
          <FormattedMessage {...messages.statusExpired} />
        </Badge>
      ) : null}
    </span>
  );
}
