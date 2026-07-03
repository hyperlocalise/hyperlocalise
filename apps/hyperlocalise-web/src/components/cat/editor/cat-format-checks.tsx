"use client";

import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { catFormatChecksMessages } from "@/components/cat/shared/cat.messages";
import type { CatFormatCheck } from "@/components/cat/shared/types";

function FormatCheckIcon({ status }: { status: CatFormatCheck["status"] }) {
  switch (status) {
    case "pass":
      return <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 text-grove-300" />;
    case "fail":
      return <HugeiconsIcon icon={AlertCircleIcon} className="size-4 text-flame-200" />;
    default:
      return <HugeiconsIcon icon={InformationCircleIcon} className="size-4 text-bud-300" />;
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
      <div className="rounded-lg border border-dashed border-foreground/12 px-3 py-4 text-center text-xs text-muted-foreground">
        <FormattedMessage {...catFormatChecksMessages.emptyChecks} />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-foreground/8 rounded-xl border border-foreground/8 bg-foreground/2">
      {checks.map((check) => (
        <li key={check.id} className="flex items-start gap-3 px-3 py-3">
          <FormatCheckIcon status={check.status} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-foreground/88">{check.label}</p>
              <span
                className={cn(
                  "shrink-0 text-xs font-medium",
                  check.status === "pass" && "text-grove-300",
                  check.status === "warn" && "text-bud-300",
                  check.status === "fail" && "text-flame-200",
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
  );
}
