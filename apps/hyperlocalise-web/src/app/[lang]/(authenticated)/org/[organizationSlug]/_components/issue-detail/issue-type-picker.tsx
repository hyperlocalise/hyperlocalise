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
import { useMemo } from "react";
import { useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/primitives/cn";

import { issueTypeLabel, issueTypeValues, type IssueTypeValue } from "./issue-detail-utils";

const DEFAULT_TRIGGER_CLASS_NAME = "h-auto px-2 py-1.5 hover:bg-muted/60";

export function IssueTypePicker({
  value,
  onValueChange,
  disabled = false,
  triggerClassName,
  showIcon = true,
  "aria-label": ariaLabel,
}: {
  value: IssueTypeValue;
  onValueChange: (value: IssueTypeValue) => void;
  disabled?: boolean;
  triggerClassName?: string;
  showIcon?: boolean;
  "aria-label"?: string;
}) {
  const intl = useIntl();
  const items = useMemo(
    () =>
      issueTypeValues.map((issueType) => ({
        value: issueType,
        label: issueTypeLabel(intl, issueType),
      })),
    [intl],
  );

  return (
    <Select
      value={value}
      items={items}
      onValueChange={(next) => {
        if (next && issueTypeValues.includes(next as IssueTypeValue)) {
          onValueChange(next as IssueTypeValue);
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        showIcon={showIcon}
        className={cn(DEFAULT_TRIGGER_CLASS_NAME, triggerClassName)}
      >
        <Badge variant="outline" className="rounded-full">
          {issueTypeLabel(intl, value)}
        </Badge>
      </SelectTrigger>
      <SelectContent>
        {items.map((type) => (
          <SelectItem key={type.value} value={type.value} label={type.label}>
            {type.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type { IssueTypeValue };
