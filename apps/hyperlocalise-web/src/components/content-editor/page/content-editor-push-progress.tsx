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
import { ArrowClockwiseIcon, WarningIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/primitives/cn";

import { contentEditorPushProgressMessages as messages } from "./content-editor-push-progress.messages";

const TRANSLATED_TEXT_CLASS = "text-[var(--ds-blue-900)]";
const APPROVED_TEXT_CLASS = "text-[var(--ds-green-900)]";
const TRANSLATED_TONE_CLASS = "bg-[var(--ds-blue-700)]";
const APPROVED_TONE_CLASS = "bg-[var(--ds-green-700)]";

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function ContentEditorPushProgressBar({
  locale,
  translationProgress,
  approvalProgress,
}: {
  locale: string;
  translationProgress: number;
  approvalProgress: number;
}) {
  const intl = useIntl();
  const translated = clampPercent(translationProgress);
  const approved = Math.min(translated, clampPercent(approvalProgress));
  return (
    <div
      role="progressbar"
      aria-label={intl.formatMessage(messages.progressBarLabel, {
        locale,
        translated,
        approved,
      })}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={translated}
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className={cn("absolute inset-y-0 start-0 transition-[width]", TRANSLATED_TONE_CLASS)}
        style={{ width: `${translated}%` }}
      />
      <div
        className={cn("absolute inset-y-0 start-0 transition-[width]", APPROVED_TONE_CLASS)}
        style={{ width: `${approved}%` }}
      />
    </div>
  );
}

export function ContentEditorPushProgressPercents({
  translationProgress,
  approvalProgress,
}: {
  translationProgress: number;
  approvalProgress: number;
}) {
  const intl = useIntl();
  return (
    <span
      className="inline-flex items-center gap-1 font-mono tabular-nums"
      title={intl.formatMessage(messages.progressLabel, {
        translated: translationProgress,
        approved: approvalProgress,
      })}
      aria-label={intl.formatMessage(messages.progressLabel, {
        translated: translationProgress,
        approved: approvalProgress,
      })}
    >
      <span className={cn("inline-block w-[4.5ch] text-end", TRANSLATED_TEXT_CLASS)}>
        <FormattedMessage
          {...messages.translationPercent}
          values={{ percent: translationProgress }}
        />
      </span>
      <span aria-hidden>·</span>
      <span className={cn("inline-block w-[4.5ch] text-end", APPROVED_TEXT_CLASS)}>
        <FormattedMessage {...messages.approvalPercent} values={{ percent: approvalProgress }} />
      </span>
    </span>
  );
}

export function ContentEditorPushLocaleProgressRows({
  locales,
}: {
  locales: readonly {
    locale: string;
    translationProgress: number;
    approvalProgress: number;
  }[];
}) {
  if (locales.length === 0) {
    return null;
  }
  return (
    <span className="mt-1 flex flex-col gap-1 text-xs">
      {locales.map((row) => (
        <span key={row.locale} className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <span className="shrink-0 font-mono">{row.locale}</span>
          <span className="min-w-10 flex-1">
            <ContentEditorPushProgressBar
              locale={row.locale}
              translationProgress={row.translationProgress}
              approvalProgress={row.approvalProgress}
            />
          </span>
          <span className="shrink-0">
            <ContentEditorPushProgressPercents
              translationProgress={row.translationProgress}
              approvalProgress={row.approvalProgress}
            />
          </span>
        </span>
      ))}
    </span>
  );
}

export function ContentEditorPushRefreshButton({
  fetching,
  disabled,
  onRefresh,
}: {
  fetching: boolean;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const intl = useIntl();
  const label = intl.formatMessage(messages.refresh);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="ms-auto"
      disabled={disabled || fetching}
      onClick={onRefresh}
      aria-label={label}
      title={label}
    >
      {fetching ? (
        <Spinner className="size-3" />
      ) : (
        <ArrowClockwiseIcon className="size-3.5" aria-hidden />
      )}
    </Button>
  );
}

export function ContentEditorPushApproveHint() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
      <WarningIcon className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      <p className="flex-1 text-foreground">
        <FormattedMessage {...messages.approveHint} />
      </p>
    </div>
  );
}
