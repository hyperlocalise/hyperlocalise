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
import { AlertCircleIcon, AlertTriangleIcon } from "lucide-react";
import { useMemo } from "react";
import { useIntl } from "react-intl";

import { Spinner } from "@/components/ui/spinner";
import {
  formatCheckRowBackgroundClass,
  formatCheckStatusClass,
} from "@/components/cat/segment/cat-tone";
import { catSideBySidePanelMessages } from "@/components/cat/shared/cat.messages";
import type { CatFormatCheck } from "@/components/cat/shared/types";
import { cn } from "@/lib/primitives/cn";

function worstActionableStatus(checks: CatFormatCheck[]): "warn" | "fail" | null {
  let worst: "warn" | "fail" | null = null;
  for (const check of checks) {
    if (check.status === "fail") {
      return "fail";
    }
    if (check.status === "warn") {
      worst = "warn";
    }
  }
  return worst;
}

export function CatSideBySideFormatCheckIcon({
  formatChecks,
  isLoading = false,
  className,
}: {
  formatChecks: CatFormatCheck[];
  isLoading?: boolean;
  className?: string;
}) {
  const intl = useIntl();
  const actionableChecks = useMemo(
    () => formatChecks.filter((check) => check.status !== "pass"),
    [formatChecks],
  );
  const status = worstActionableStatus(actionableChecks);

  if (isLoading) {
    return (
      <span
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
          className,
        )}
      >
        <Spinner
          className="size-3.5"
          aria-label={intl.formatMessage(catSideBySidePanelMessages.formatCheckLoading)}
        />
      </span>
    );
  }

  if (!status) {
    return null;
  }

  const summary = actionableChecks.map((check) => `${check.label}: ${check.message}`).join("\n");
  const label = intl.formatMessage(
    status === "fail"
      ? catSideBySidePanelMessages.formatCheckFail
      : catSideBySidePanelMessages.formatCheckWarn,
    { count: actionableChecks.length },
  );
  const Icon = status === "fail" ? AlertCircleIcon : AlertTriangleIcon;

  return (
    <span
      role="img"
      aria-label={label}
      title={summary}
      data-status={status}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md",
        formatCheckRowBackgroundClass(status),
        formatCheckStatusClass(status),
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}
