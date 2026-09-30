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
import { useIntl } from "react-intl";

import { jobDetailAssigneeFieldMessages as messages } from "./job-detail-assignee-field.messages";
import { getAssigneeOverflowParts } from "./job-assignee-overflow";

export function JobAssigneeOverflowLabel({
  labels,
  emptyLabel,
}: {
  labels: readonly string[];
  emptyLabel: string;
}) {
  const intl = useIntl();
  const { firstLabel, remainingCount, fullLabel } = getAssigneeOverflowParts(labels);

  if (!firstLabel) {
    return emptyLabel;
  }

  return (
    <span className="flex min-w-0 items-center gap-1" title={fullLabel}>
      <span className="min-w-0 truncate">{firstLabel}</span>
      {remainingCount > 0 ? (
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {intl.formatMessage(messages.overflowCount, { count: remainingCount })}
        </span>
      ) : null}
    </span>
  );
}
