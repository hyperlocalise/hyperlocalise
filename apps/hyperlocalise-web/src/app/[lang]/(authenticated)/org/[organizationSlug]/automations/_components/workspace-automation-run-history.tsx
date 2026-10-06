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
import { useState, type ReactNode } from "react";
import { CaretRightIcon, CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  WorkspaceAutomationRunRecord,
  WorkspaceAutomationRunStatus,
} from "@/lib/agents/workspace-automation-types";
import { cn } from "@/lib/primitives/cn";

import { workspaceAutomationFormMessages } from "./workspace-automation-form.messages";
import {
  humanizeRunSummaryKey,
  isIsoDateTime,
  isRunSummaryRecord,
  resolveRunHeadline,
  runHasDetails,
} from "./workspace-automation-run-summary";

const EMPTY_CELL = "—";
const ROW_GRID =
  "grid grid-cols-[1.25rem_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-4";

const RUN_STATUS_BADGE_VARIANTS: Record<
  WorkspaceAutomationRunStatus,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  queued: "outline",
  running: "secondary",
  succeeded: "success",
  failed: "destructive",
  cancelled: "outline",
  skipped: "warning",
};

function formatRunStatus(intl: IntlShape, status: string) {
  const statusMessages = {
    queued: workspaceAutomationFormMessages.runStatusQueued,
    running: workspaceAutomationFormMessages.runStatusRunning,
    succeeded: workspaceAutomationFormMessages.runStatusSucceeded,
    failed: workspaceAutomationFormMessages.runStatusFailed,
    cancelled: workspaceAutomationFormMessages.runStatusCancelled,
    skipped: workspaceAutomationFormMessages.runStatusSkipped,
  } as const;

  const message = statusMessages[status as keyof typeof statusMessages];
  return message ? intl.formatMessage(message) : status;
}

function formatTriggerSource(intl: IntlShape, triggerSource: string) {
  const triggerMessages = {
    manual: workspaceAutomationFormMessages.triggerSourceManual,
    scheduled: workspaceAutomationFormMessages.triggerSourceScheduled,
    github: workspaceAutomationFormMessages.triggerSourceGithub,
    contentful: workspaceAutomationFormMessages.triggerSourceContentful,
    source_upload: workspaceAutomationFormMessages.triggerSourceSourceUpload,
    web_chat: workspaceAutomationFormMessages.triggerSourceWebChat,
  } as const;

  const message = triggerMessages[triggerSource as keyof typeof triggerMessages];
  return message ? intl.formatMessage(message) : triggerSource;
}

function RunSummaryScalar({ value }: { value: unknown }) {
  const intl = useIntl();

  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{EMPTY_CELL}</span>;
  }
  if (typeof value === "boolean") {
    return (
      <FormattedMessage
        {...(value
          ? workspaceAutomationFormMessages.runSummaryYes
          : workspaceAutomationFormMessages.runSummaryNo)}
      />
    );
  }
  if (typeof value === "number") {
    return <>{intl.formatNumber(value)}</>;
  }
  if (typeof value === "string" && isIsoDateTime(value)) {
    return <>{intl.formatDate(value, { dateStyle: "medium", timeStyle: "short" })}</>;
  }
  return <>{typeof value === "string" ? value : JSON.stringify(value)}</>;
}

/** Renders any JSON value as labelled rows, nesting for objects and lists of objects. */
function RunSummaryValue({ value }: { value: unknown }): ReactNode {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground">{EMPTY_CELL}</span>;
    }
    if (value.every((entry) => !isRunSummaryRecord(entry) && !Array.isArray(entry))) {
      return (
        <span className="flex flex-wrap gap-1.5">
          {value.map((entry, index) => (
            <Badge key={index} variant="outline" className="font-normal">
              <RunSummaryScalar value={entry} />
            </Badge>
          ))}
        </span>
      );
    }
    return (
      <ol className="flex flex-col gap-2">
        {value.map((entry, index) => (
          <li key={index} className="rounded-lg border border-border px-3 py-2">
            <RunSummaryValue value={entry} />
          </li>
        ))}
      </ol>
    );
  }

  if (isRunSummaryRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <span className="text-muted-foreground">{EMPTY_CELL}</span>;
    }
    return (
      <dl className="flex flex-col gap-2">
        {entries.map(([key, entry]) => {
          const nested =
            isRunSummaryRecord(entry) || (Array.isArray(entry) && entry.some(isRunSummaryRecord));
          return (
            <div
              key={key}
              className={cn(
                "min-w-0",
                nested ? "flex flex-col gap-1.5" : "grid grid-cols-[10rem_minmax(0,1fr)] gap-3",
              )}
            >
              <dt className="text-xs leading-5 text-muted-foreground">
                {humanizeRunSummaryKey(key)}
              </dt>
              <dd
                className={cn(
                  "min-w-0 text-sm leading-5 break-words whitespace-pre-wrap text-foreground",
                  nested && "border-l border-border ps-3",
                )}
              >
                <RunSummaryValue value={entry} />
              </dd>
            </div>
          );
        })}
      </dl>
    );
  }

  return <RunSummaryScalar value={value} />;
}

function RawJsonBlock({ value }: { value: unknown }) {
  const intl = useIntl();
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(value, null, 2);

  return (
    <div className="relative">
      <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-xs leading-5 text-foreground">
        {json}
      </pre>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute end-2 top-2 text-muted-foreground hover:text-foreground"
        aria-label={intl.formatMessage(workspaceAutomationFormMessages.runSummaryCopyJson)}
        onClick={() => {
          void navigator.clipboard.writeText(json).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}

function RunDetails({ run }: { run: WorkspaceAutomationRunRecord }) {
  const [showRaw, setShowRaw] = useState(false);
  const hasError = Object.keys(run.error ?? {}).length > 0;
  const hasSummary = Object.keys(run.outputSummary).length > 0;

  return (
    <div className="flex flex-col gap-4 border-t border-border bg-background/40 px-4 py-4 ps-13">
      {showRaw ? (
        <RawJsonBlock
          value={
            hasError ? { error: run.error, outputSummary: run.outputSummary } : run.outputSummary
          }
        />
      ) : (
        <>
          {hasError ? (
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2">
              <RunSummaryValue value={run.error} />
            </div>
          ) : null}
          {hasSummary ? <RunSummaryValue value={run.outputSummary} /> : null}
        </>
      )}
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="w-fit text-muted-foreground"
        aria-pressed={showRaw}
        onClick={() => setShowRaw((current) => !current)}
      >
        <FormattedMessage
          {...(showRaw
            ? workspaceAutomationFormMessages.runSummaryHideJson
            : workspaceAutomationFormMessages.runSummaryShowJson)}
        />
      </Button>
    </div>
  );
}

function RunRow({ run }: { run: WorkspaceAutomationRunRecord }) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const expandable = runHasDetails(run);
  const headline = resolveRunHeadline(run);

  const cells = (
    <>
      <CaretRightIcon
        className={cn(
          "size-3.5 text-muted-foreground transition-transform",
          open && "rotate-90",
          !expandable && "invisible",
        )}
      />
      <Badge variant={RUN_STATUS_BADGE_VARIANTS[run.status] ?? "outline"} className="w-fit">
        {formatRunStatus(intl, run.status)}
      </Badge>
      <span>{formatTriggerSource(intl, run.triggerSource)}</span>
      <span className={cn("text-muted-foreground", open ? "break-words" : "truncate")}>
        {headline ??
          (expandable
            ? intl.formatMessage(workspaceAutomationFormMessages.runSummaryNoHeadline)
            : EMPTY_CELL)}
      </span>
      <span className="text-muted-foreground">
        {run.completedAt
          ? intl.formatDate(run.completedAt, { dateStyle: "medium", timeStyle: "short" })
          : EMPTY_CELL}
      </span>
    </>
  );

  return (
    <div className="border-b border-border last:border-b-0">
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          className={cn(
            ROW_GRID,
            "w-full px-4 py-4 text-start text-sm outline-none hover:bg-gray-alpha-100 focus-visible:bg-gray-alpha-100",
          )}
          onClick={() => setOpen((current) => !current)}
        >
          {cells}
        </button>
      ) : (
        <div className={cn(ROW_GRID, "px-4 py-4 text-sm")}>{cells}</div>
      )}
      {open ? <RunDetails run={run} /> : null}
    </div>
  );
}

export function RunHistoryTable({ runs }: { runs: WorkspaceAutomationRunRecord[] }) {
  if (runs.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-muted px-4 py-10">
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...workspaceAutomationFormMessages.noRunsYet} />
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted">
      <div
        className={cn(
          ROW_GRID,
          "border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground",
        )}
      >
        <span />
        <span>
          <FormattedMessage {...workspaceAutomationFormMessages.historyStatus} />
        </span>
        <span>
          <FormattedMessage {...workspaceAutomationFormMessages.historyTrigger} />
        </span>
        <span>
          <FormattedMessage {...workspaceAutomationFormMessages.historySummary} />
        </span>
        <span>
          <FormattedMessage {...workspaceAutomationFormMessages.historyCompleted} />
        </span>
      </div>
      {runs.map((run) => (
        <RunRow key={run.id} run={run} />
      ))}
    </div>
  );
}
