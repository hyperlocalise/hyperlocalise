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
} from "@/components/content-editor/segment/content-editor-tone";
import { contentEditorFormatChecksMessages } from "@/components/content-editor/shared/content-editor.messages";
import type { ContentEditorFormatCheck } from "@/components/content-editor/shared/types";

function FormatCheckIcon({ status }: { status: ContentEditorFormatCheck["status"] }) {
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
  status: ContentEditorFormatCheck["status"],
  intl: ReturnType<typeof useIntl>,
) {
  switch (status) {
    case "pass":
      return intl.formatMessage(contentEditorFormatChecksMessages.statusPass);
    case "warn":
      return intl.formatMessage(contentEditorFormatChecksMessages.statusWarn);
    case "fail":
      return intl.formatMessage(contentEditorFormatChecksMessages.statusFail);
    default:
      return status;
  }
}

export function ContentEditorFormatChecks({ checks }: { checks: ContentEditorFormatCheck[] }) {
  const intl = useIntl();

  if (checks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
        <FormattedMessage {...contentEditorFormatChecksMessages.emptyChecks} />
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
