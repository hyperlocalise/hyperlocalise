"use client";

import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import {
  formatCheckRowBackgroundClass,
  formatCheckStatusClass,
} from "@/components/cat/segment/cat-tone";
import { catFormatChecksMessages } from "@/components/cat/shared/cat.messages";
import type { CatFormatCheck } from "@/components/cat/shared/types";

function FormatCheckIcon({ status }: { status: CatFormatCheck["status"] }) {
  const className = cn("size-4 shrink-0", formatCheckStatusClass(status));

  switch (status) {
    case "pass":
      return <HugeiconsIcon icon={CheckmarkCircle02Icon} className={className} />;
    case "fail":
      return <HugeiconsIcon icon={AlertCircleIcon} className={className} />;
    default:
      return <HugeiconsIcon icon={InformationCircleIcon} className={className} />;
  }
}

function formatCheckStatusLabel(
  status: CatFormatCheck["status"],
  intl: ReturnType<typeof useIntl>,
) {
  switch (status) {
    case "pass":
      return intl.formatMessage(catFormatChecksMessages.statusPass);
    case "warn":
      return intl.formatMessage(catFormatChecksMessages.statusWarn);
    case "fail":
      return intl.formatMessage(catFormatChecksMessages.statusFail);
    default:
      return status;
  }
}

export function CatFormatChecks({ checks }: { checks: CatFormatCheck[] }) {
  const intl = useIntl();

  if (checks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
        <FormattedMessage {...catFormatChecksMessages.emptyChecks} />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl">
      <ul className="divide-y divide-border">
        {checks.map((check) => (
          <li
            key={check.id}
            className={cn(
              "flex items-start gap-3 px-3 py-3",
              formatCheckRowBackgroundClass(check.status),
            )}
          >
            <FormatCheckIcon status={check.status} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{check.label}</p>
                <span
                  className={cn(
                    "shrink-0 text-xs font-medium",
                    formatCheckStatusClass(check.status),
                  )}
                >
                  {formatCheckStatusLabel(check.status, intl)}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{check.message}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
