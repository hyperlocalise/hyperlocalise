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
import { useState } from "react";

import {
  MarkdownDescriptionEditor,
  MarkdownDescriptionPreview,
} from "@/components/markdown-description-editor/markdown-description-editor";
import { cn } from "@/lib/primitives/cn";

export function IssueMarkdownField({
  value,
  onChange,
  onCommit,
  disabled = false,
  placeholder,
  emptyMessage,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  disabled?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  ariaLabel: string;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <MarkdownDescriptionEditor
        value={value}
        onChange={onChange}
        onBlur={() => {
          onCommit();
          setIsEditing(false);
        }}
        disabled={disabled}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        chrome="minimal"
      />
    );
  }

  return (
    <div
      className={cn(
        "cursor-text rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
        disabled && "cursor-not-allowed opacity-60",
      )}
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      onClick={() => {
        if (!disabled) {
          setIsEditing(true);
        }
      }}
      onKeyDown={(event) => {
        if (disabled) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setIsEditing(true);
        }
      }}
    >
      <MarkdownDescriptionPreview
        value={value}
        emptyMessage={emptyMessage ?? placeholder}
        chrome="minimal"
        contentClassName="min-h-[3rem]"
      />
    </div>
  );
}
