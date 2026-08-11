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
import { CheckIcon, SparklesIcon } from "lucide-react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/primitives/cn";

import { catVisualEditorMessages } from "./cat-visual-editor.messages";

export function CatVisualEditorInlineEdit({
  value,
  maxLength,
  onChange,
  onConfirm,
  onApplyAi,
  className,
}: {
  value: string;
  maxLength?: number;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onApplyAi?: () => void;
  className?: string;
}) {
  const intl = useIntl();
  const currentLength = value.length;
  const overLimit = typeof maxLength === "number" && currentLength > maxLength;

  return (
    <div
      className={cn(
        "z-20 w-[min(100%,22rem)] rounded-xl border border-grove-300/50 bg-background p-2.5 shadow-lg shadow-grove-900/10",
        className,
      )}
      data-slot="visual-editor-inline-edit"
    >
      <div className="flex items-center gap-1.5">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onConfirm();
            }
          }}
          className="h-9 flex-1"
          maxLength={maxLength ? maxLength + 20 : undefined}
        />
        <Button
          size="icon-sm"
          variant="default"
          onClick={onConfirm}
          aria-label={intl.formatMessage(catVisualEditorMessages.inlineConfirm)}
        >
          <CheckIcon className="size-3.5" />
        </Button>
        {onApplyAi ? (
          <Button
            size="icon-sm"
            variant="outline"
            onClick={onApplyAi}
            aria-label={intl.formatMessage(catVisualEditorMessages.inlineAi)}
          >
            <SparklesIcon className="size-3.5" />
          </Button>
        ) : null}
      </div>
      {typeof maxLength === "number" ? (
        <p
          className={cn(
            "mt-1.5 text-right text-[11px] tabular-nums text-muted-foreground",
            overLimit && "text-destructive",
          )}
        >
          <FormattedMessage
            {...catVisualEditorMessages.characterCount}
            values={{ current: currentLength, max: maxLength }}
          />
        </p>
      ) : null}
    </div>
  );
}
