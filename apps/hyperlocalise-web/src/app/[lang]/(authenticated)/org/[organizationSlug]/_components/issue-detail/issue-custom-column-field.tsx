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
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/primitives/cn";

import { IssueAssigneePicker } from "./issue-assignee-picker";
import { IssueMarkdownField } from "./issue-markdown-field";
import { issueCustomColumnFieldMessages as messages } from "./issue-custom-column-field.messages";
import { issueSheetColumnValueString } from "./issue-sheet-column-utils";
import type { IssueSheetColumn } from "./issue-sheet-column-types";
import type { AssignableIssueMember } from "./use-assignable-issue-members";

const ghostSelectTriggerClassName =
  "h-8 max-w-full justify-end border-transparent bg-transparent px-1.5 shadow-none hover:bg-muted/60 focus-visible:border-ring";

export function IssueCustomColumnField({
  column,
  value,
  emptyValue,
  disabled = false,
  variant,
  members = [],
  membersLoading = false,
  onChange,
}: {
  column: IssueSheetColumn;
  value: unknown;
  emptyValue: string;
  disabled?: boolean;
  variant: "sidebar" | "main";
  members?: AssignableIssueMember[];
  membersLoading?: boolean;
  onChange: (value: unknown) => void;
}) {
  const intl = useIntl();
  const currentValue = issueSheetColumnValueString(value);
  const [draft, setDraft] = useState(currentValue);

  useEffect(() => {
    setDraft(currentValue);
  }, [column.id, currentValue]);

  if (column.type === "select") {
    const options = column.config.options ?? [];
    const selectItems = options.map((option) => ({
      value: option.id,
      label: option.label,
    }));

    return (
      <Select
        value={currentValue || undefined}
        items={selectItems}
        onValueChange={(next) => {
          onChange(next ?? "");
        }}
        disabled={disabled}
      >
        <SelectTrigger
          className={variant === "sidebar" ? ghostSelectTriggerClassName : "w-full max-w-xs"}
        >
          <SelectValue placeholder={emptyValue} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id} label={option.label}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (column.type === "user") {
    const selectedMember = members.find((member) => member.userId === currentValue);
    return (
      <IssueAssigneePicker
        value={currentValue || null}
        currentLabel={selectedMember ? selectedMember.displayName || selectedMember.email : null}
        members={members}
        isLoading={membersLoading}
        disabled={disabled}
        size={variant === "sidebar" ? "ghost" : "default"}
        triggerClassName={variant === "sidebar" ? ghostSelectTriggerClassName : undefined}
        onChange={(assigneeUserId) => {
          onChange(assigneeUserId ?? "");
        }}
      />
    );
  }

  if (column.type === "long_text" || column.type === "enrichment") {
    const placeholder =
      column.type === "enrichment"
        ? intl.formatMessage(messages.enrichmentPlaceholder)
        : intl.formatMessage(messages.addNotePlaceholder);

    if (variant === "main") {
      return (
        <IssueMarkdownField
          value={draft}
          onChange={setDraft}
          onCommit={() => {
            if (draft !== currentValue) {
              onChange(draft);
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          emptyMessage={intl.formatMessage(messages.emptyLongText)}
          ariaLabel={column.label}
        />
      );
    }

    return (
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => {
          if (draft !== currentValue) {
            onChange(draft);
          }
        }}
        disabled={disabled}
        placeholder={placeholder}
        rows={3}
        className="min-h-20 w-full"
      />
    );
  }

  return (
    <Input
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => {
        if (draft !== currentValue) {
          onChange(draft);
        }
      }}
      disabled={disabled}
      placeholder={emptyValue}
      className={cn(
        variant === "sidebar" &&
          "h-8 border-transparent bg-transparent px-1.5 text-end shadow-none hover:bg-muted/60 focus-visible:border-ring",
        variant === "main" ? "w-full" : "w-44 max-w-full",
      )}
    />
  );
}
