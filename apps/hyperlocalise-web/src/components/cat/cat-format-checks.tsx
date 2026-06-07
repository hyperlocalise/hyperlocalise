"use client";

import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/primitives/cn";

import { catToneClass, formatCheckTone } from "./cat-tone";
import type { CatFormatCheck } from "./types";

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

export function CatFormatChecks({ checks }: { checks: CatFormatCheck[] }) {
  if (checks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-foreground/12 px-3 py-4 text-center text-xs text-muted-foreground">
        No format or QA checks for this segment yet.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {checks.map((check) => (
        <li
          key={check.id}
          className="flex items-start gap-2.5 rounded-lg border border-foreground/8 bg-foreground/2 px-3 py-2.5"
        >
          <FormatCheckIcon status={check.status} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground/88">{check.label}</p>
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full text-[10px]",
                  catToneClass(formatCheckTone(check.status)),
                )}
              >
                {check.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{check.message}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
