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
  WarningIcon,
  WarningCircleIcon,
  CheckCircleIcon,
  InfinityIcon,
} from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { contentEditorTargetEditorMessages } from "@/components/content-editor/shared/content-editor.messages";
import { createElement } from "react";

const NEAR_LIMIT_RATIO = 0.9;

export type ContentEditorCharacterMeterState = "none" | "within" | "near" | "over";

export function characterMeterState(
  count: number,
  maxLength?: number | null,
): ContentEditorCharacterMeterState {
  if (maxLength == null || maxLength <= 0) {
    return "none";
  }
  if (count > maxLength) {
    return "over";
  }
  if (count >= maxLength * NEAR_LIMIT_RATIO) {
    return "near";
  }
  return "within";
}

const STATE_TEXT_CLASS_NAME: Record<ContentEditorCharacterMeterState, string> = {
  none: "text-muted-foreground",
  within: "text-grove-900",
  near: "text-beam-900",
  over: "text-flame-900",
};

const STATE_FILL_CLASS_NAME: Record<ContentEditorCharacterMeterState, string> = {
  none: "bg-muted-foreground/30",
  within: "bg-grove-700",
  near: "bg-beam-700",
  over: "bg-flame-700",
};

const STATE_ICON = {
  none: InfinityIcon,
  within: CheckCircleIcon,
  near: WarningIcon,
  over: WarningCircleIcon,
} as const;

function CharacterMeterStatus({
  state,
  count,
  maxLength,
  className,
}: {
  state: ContentEditorCharacterMeterState;
  count: number;
  maxLength?: number | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 font-medium",
        STATE_TEXT_CLASS_NAME[state],
        className,
      )}
    >
      {createElement(STATE_ICON[state], { className: "size-3.5 shrink-0", "aria-hidden": true })}
      {state === "over" && maxLength != null ? (
        <FormattedMessage
          {...contentEditorTargetEditorMessages.characterMeterOverLimit}
          values={{ count: count - maxLength }}
        />
      ) : state === "near" ? (
        <FormattedMessage {...contentEditorTargetEditorMessages.characterMeterNearLimit} />
      ) : state === "within" ? (
        <FormattedMessage {...contentEditorTargetEditorMessages.characterMeterWithinLimit} />
      ) : (
        <FormattedMessage {...contentEditorTargetEditorMessages.characterMeterNoLimit} />
      )}
    </span>
  );
}

function CharacterMeterBar({
  state,
  count,
  maxLength,
  className,
}: {
  state: ContentEditorCharacterMeterState;
  count: number;
  maxLength: number;
  className?: string;
}) {
  const percent = Math.min(100, Math.round((count / maxLength) * 100));

  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={maxLength}
      aria-valuenow={Math.min(count, maxLength)}
      className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-200 ease-out",
          STATE_FILL_CLASS_NAME[state],
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function ContentEditorCharacterMeter({
  count,
  maxLength,
  variant = "panel",
  className,
}: {
  count: number;
  maxLength?: number | null;
  variant?: "panel" | "compact";
  className?: string;
}) {
  const intl = useIntl();
  const state = characterMeterState(count, maxLength);
  const hasLimit = state !== "none" && maxLength != null;
  const ariaLabel = hasLimit
    ? intl.formatMessage(contentEditorTargetEditorMessages.characterCountAria, {
        count,
        maxLength,
      })
    : intl.formatMessage(contentEditorTargetEditorMessages.characterCountOnlyAria, { count });
  const countLabel = hasLimit ? (
    <FormattedMessage
      {...contentEditorTargetEditorMessages.characterCount}
      values={{ count, maxLength }}
    />
  ) : (
    <FormattedMessage
      {...contentEditorTargetEditorMessages.characterCountOnly}
      values={{ count }}
    />
  );

  if (variant === "compact") {
    return (
      <div
        className={cn("flex min-w-0 items-center gap-2 text-xs", className)}
        data-state={state}
        aria-live="polite"
        aria-label={ariaLabel}
      >
        {hasLimit ? (
          <CharacterMeterBar
            state={state}
            count={count}
            maxLength={maxLength}
            className="h-1 w-14 shrink-0"
          />
        ) : null}
        <span
          className={cn(
            "tabular-nums",
            state === "over" ? "font-medium text-flame-900" : "text-muted-foreground",
          )}
        >
          {countLabel}
        </span>
        <CharacterMeterStatus state={state} count={count} maxLength={maxLength} />
      </div>
    );
  }

  return (
    <div
      className={cn("min-w-0 space-y-2", className)}
      data-state={state}
      aria-live="polite"
      aria-label={ariaLabel}
    >
      {hasLimit ? (
        <CharacterMeterBar state={state} count={count} maxLength={maxLength} />
      ) : (
        <div className="h-1.5 rounded-full border border-dashed border-border" />
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <span
          className={cn(
            "tabular-nums",
            state === "over" ? "font-medium text-flame-900" : "text-muted-foreground",
          )}
        >
          {countLabel}
        </span>
        <CharacterMeterStatus state={state} count={count} maxLength={maxLength} />
      </div>
    </div>
  );
}
