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
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { cn } from "@/lib/primitives/cn";
import { humanizeQaFindingMessage } from "@/lib/qa/humanize-qa-finding-message";
import {
  createProjectQaReportClient,
  createWorkspaceQaReportClient,
  type ProjectQaFinding,
} from "@/lib/qa/qa-report-client";
import { translationQaCheckTypes, type TranslationQaCheckType } from "@/lib/qa/types";
import { qaMessages as m } from "./qa.messages";
import { qaFindingsTableMessages as originalMessages } from "./qa-findings-table.messages";
import { QaNotice } from "./qa-status";

export type QaFindingRow = Omit<ProjectQaFinding, "sourcePath" | "category" | "relatedTokens"> & {
  projectName?: string;
  sourcePath?: string | null;
  category?: string;
  relatedTokens?: string[];
};
export function qaCheckLabel(check: string, intl: ReturnType<typeof useIntl>) {
  return intl.formatMessage(
    (translationQaCheckTypes as readonly string[]).includes(check)
      ? m[check as TranslationQaCheckType]
      : m.check,
  );
}

function findingAccentClass(finding: QaFindingRow) {
  if (finding.status === "resolved") return "border-l-success bg-success/10";
  if (finding.status === "ignored") return "border-l-border bg-muted/50";
  if (finding.severity === "error") {
    return "border-l-destructive bg-destructive/10 dark:bg-destructive/15";
  }
  return "border-l-warning bg-warning/10 dark:bg-warning/15";
}

function findingStatusVariant(status: QaFindingRow["status"]) {
  if (status === "resolved") return "success" as const;
  if (status === "ignored") return "secondary" as const;
  return "outline" as const;
}
export function QaFindingsTable({
  organizationSlug,
  findings,
  total,
  shownCount,
  canPromote,
  promoteScope,
  projectId,
  lastCompletedByProject,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onPromoted,
}: {
  organizationSlug: string;
  findings: QaFindingRow[];
  total: number;
  shownCount: number;
  canPromote: boolean;
  promoteScope: "workspace" | "project";
  projectId?: string;
  lastCompletedByProject?: Record<string, string | null>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onPromoted?: () => void;
}) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [ignoringId, setIgnoringId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const eligible = findings.filter(
    (f) => (f.status ?? "open") === "open" && !f.needsRecheck && !f.issueIdentifier,
  );
  const selected = eligible.filter((f) => selectedIds.has(f.id));
  async function refresh() {
    await Promise.all(
      [
        "project-qa-reports",
        "workspace-qa-findings",
        "workspace-qa-reports",
        "cat-qa-scan-findings",
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key, organizationSlug] })),
    );
    onPromoted?.();
  }
  const review = useMutation({
    mutationFn: ({
      id,
      status,
      reason: reviewReason,
    }: {
      id: string;
      status: "open" | "ignored";
      reason?: string;
    }) =>
      client.qaReport.findings.review(organizationSlug, id, { status, reason: reviewReason ?? "" }),
    onSuccess: async () => {
      setIgnoringId(null);
      setReason("");
      await refresh();
    },
  });
  const promote = useMutation({
    mutationFn: async (ids: string[]) => {
      for (let offset = 0; offset < ids.length; offset += 100) {
        const json = { findingIds: ids.slice(offset, offset + 100) };
        if (promoteScope === "project" && projectId)
          await createProjectQaReportClient(client).promoteFindings({
            param: { organizationSlug, projectId },
            json,
          });
        else
          await createWorkspaceQaReportClient(client).promoteFindings({
            param: { organizationSlug },
            json,
          });
      }
    },
    onSuccess: async () => {
      setSelectedIds(new Set());
      await refresh();
    },
    onError: () => {
      toast.error(intl.formatMessage(originalMessages.promoteError));
      void refresh();
    },
  });
  const groups = Map.groupBy(findings, (f) =>
    JSON.stringify([f.projectId, f.sourcePath, f.key, f.targetLocale]),
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={showWhitespace}
            onCheckedChange={(value) => setShowWhitespace(value === true)}
          />
          {intl.formatMessage(m.showWhitespace)}
        </label>
        {canPromote ? (
          <>
            <Checkbox
              aria-label={intl.formatMessage(m.selectLoaded)}
              checked={
                selected.length === 0
                  ? false
                  : selected.length === eligible.length
                    ? true
                    : "indeterminate"
              }
              onCheckedChange={(checked) =>
                setSelectedIds(checked ? new Set(eligible.map((f) => f.id)) : new Set())
              }
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!selected.length || promote.isPending}
              onClick={() => promote.mutate(selected.map((f) => f.id))}
            >
              {intl.formatMessage(m.createSelected, { count: selected.length })}
            </Button>
          </>
        ) : null}
      </div>
      {review.isError ? <QaNotice message={intl.formatMessage(m.reviewError)} /> : null}
      {[...groups.entries()].map(([groupId, rows]) => {
        const first = rows[0]!;
        const completedAt = lastCompletedByProject?.[first.projectId];
        return (
          <section
            key={groupId}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{first.key}</p>
                <p className="text-xs text-muted-foreground">
                  {[first.projectName, first.sourcePath, first.targetLocale]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {completedAt ? (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {intl.formatMessage(m.completedScanAt, {
                      date: intl.formatDate(completedAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    })}
                  </p>
                ) : null}
              </div>
              <Button
                nativeButton={false}
                render={<Link href={first.editorHref} />}
                variant="outline"
                size="sm"
              >
                {intl.formatMessage(m.review)}
              </Button>
            </div>
            <div className="grid gap-px border-y border-border bg-border md:grid-cols-2">
              <div className="bg-muted/40 px-4 py-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {intl.formatMessage(m.source)}
                </p>
                <QaText
                  text={first.sourceText}
                  tokens={rows.flatMap((f) => f.relatedTokens ?? [])}
                  visibleWhitespace={showWhitespace}
                />
              </div>
              <div className="bg-muted/40 px-4 py-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {intl.formatMessage(m.target)}
                </p>
                <QaText
                  text={first.targetText}
                  tokens={rows.flatMap((f) => f.relatedTokens ?? [])}
                  visibleWhitespace={showWhitespace}
                />
              </div>
            </div>
            {rows.map((finding) => {
              const displayMessage = humanizeQaFindingMessage(finding.message);
              return (
                <div
                  key={finding.id}
                  className={cn(
                    "flex flex-col gap-2 border-l-4 px-4 py-3",
                    findingAccentClass(finding),
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {canPromote && eligible.some((f) => f.id === finding.id) ? (
                      <Checkbox
                        checked={selectedIds.has(finding.id)}
                        aria-label={intl.formatMessage(m.select, {
                          key: finding.key,
                          locale: finding.targetLocale,
                          check: qaCheckLabel(finding.checkType, intl),
                        })}
                        onCheckedChange={(checked) =>
                          setSelectedIds((current) => {
                            const next = new Set(current);
                            if (checked) next.add(finding.id);
                            else next.delete(finding.id);
                            return next;
                          })
                        }
                      />
                    ) : null}
                    <Badge variant={finding.severity === "error" ? "destructive" : "warning"}>
                      {intl.formatMessage(m[finding.severity])}
                    </Badge>
                    <span className="text-sm font-medium">
                      {qaCheckLabel(finding.checkType, intl)}
                    </span>
                    <Badge variant={findingStatusVariant(finding.status)}>
                      {intl.formatMessage(m[finding.status ?? "open"])}
                    </Badge>
                    {finding.issueIdentifier ? (
                      <Link
                        className="text-sm underline"
                        href={`/org/${encodeURIComponent(organizationSlug)}/issues/${encodeURIComponent(finding.issueIdentifier)}`}
                      >
                        {intl.formatMessage(m.linkedIssue, { identifier: finding.issueIdentifier })}
                      </Link>
                    ) : null}
                    {canPromote && finding.status !== "resolved" && !finding.needsRecheck ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={review.isPending}
                        onClick={() => {
                          review.reset();
                          if (finding.status === "ignored")
                            review.mutate({ id: finding.id, status: "open" });
                          else {
                            setIgnoringId(finding.id);
                            setReason("");
                          }
                        }}
                      >
                        {intl.formatMessage(finding.status === "ignored" ? m.undo : m.ignore)}
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{displayMessage}</p>
                  {displayMessage !== finding.message ? (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">
                        {intl.formatMessage(m.technicalDetails)}
                      </summary>
                      <p className="mt-1 whitespace-pre-wrap break-words">{finding.message}</p>
                    </details>
                  ) : null}
                  {finding.ignoreReason ? (
                    <p className="text-xs text-muted-foreground">{finding.ignoreReason}</p>
                  ) : null}
                  {finding.needsRecheck ? (
                    <p className="text-xs text-muted-foreground">
                      {intl.formatMessage(m.needsRecheck)}
                    </p>
                  ) : null}
                  {ignoringId === finding.id ? (
                    <form
                      className="flex max-w-xl flex-col gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        review.mutate({ id: finding.id, status: "ignored", reason });
                      }}
                    >
                      <Field>
                        <FieldLabel htmlFor={`reason-${finding.id}`}>
                          {intl.formatMessage(m.reason)}
                        </FieldLabel>
                        <Input
                          id={`reason-${finding.id}`}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          required
                          maxLength={1000}
                        />
                        <FieldDescription>{intl.formatMessage(m.ignoreHelp)}</FieldDescription>
                      </Field>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          type="submit"
                          disabled={!reason.trim() || review.isPending}
                        >
                          {intl.formatMessage(m.saveIgnore)}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => setIgnoringId(null)}
                        >
                          {intl.formatMessage(m.cancel)}
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </section>
        );
      })}
      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground tabular-nums">
          {intl.formatMessage(m.shown, { shown: shownCount, total })}
        </p>
        {hasMore ? (
          <Button variant="outline" size="sm" disabled={isLoadingMore} onClick={onLoadMore}>
            {intl.formatMessage(isLoadingMore ? m.loading : m.more)}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
export function QaText({
  text,
  tokens,
  visibleWhitespace,
}: {
  text: string;
  tokens: string[];
  visibleWhitespace: boolean;
}) {
  const intl = useIntl();
  const matchingTokens = [...new Set(tokens)].filter(Boolean).sort((a, b) => b.length - a.length);
  const chunks: { text: string; highlight: boolean }[] = [];
  for (let index = 0; index < text.length;) {
    const token = matchingTokens.find((value) => text.startsWith(value, index));
    if (token) {
      chunks.push({ text: token, highlight: true });
      index += token.length;
    } else {
      const previous = chunks.at(-1);
      if (previous && !previous.highlight) previous.text += text[index];
      else chunks.push({ text: text[index]!, highlight: false });
      index++;
    }
  }
  const nbspLabel = intl.formatMessage(m.nbsp);
  return (
    <p dir="auto" className="text-sm whitespace-pre-wrap break-words">
      {text ? (
        chunks.map((chunk, index) =>
          chunk.highlight ? (
            <mark
              key={index}
              className="rounded bg-accent text-accent-foreground underline decoration-dotted"
            >
              {renderQaChars(chunk.text, visibleWhitespace, nbspLabel)}
            </mark>
          ) : (
            <span key={index}>{renderQaChars(chunk.text, visibleWhitespace, nbspLabel)}</span>
          ),
        )
      ) : (
        <span className="text-muted-foreground">{intl.formatMessage(m.emptyText)}</span>
      )}
    </p>
  );
}

const NBSP = "\u00a0";

function visibleWhitespaceMark(char: string): string | null {
  if (char === " ") return "·";
  if (char === "\t") return "⇥";
  if (char === "\n") return "↵\n";
  if (char === "\r") return "␍";
  return null;
}

function takeRun(value: string, start: number, char: string): number {
  let end = start + 1;
  while (end < value.length && value[end] === char) end += 1;
  return end;
}

function renderQaChars(value: string, visibleWhitespace: boolean, nbspLabel: string): ReactNode {
  const nodes: ReactNode[] = [];
  for (let index = 0; index < value.length;) {
    const char = value[index]!;
    if (char === NBSP) {
      const end = takeRun(value, index, NBSP);
      const count = end - index;
      nodes.push(
        <mark
          key={`nbsp-${index}`}
          title={nbspLabel}
          className="rounded-sm bg-warning/50 px-0.5 text-warning-foreground"
        >
          {(visibleWhitespace ? "·" : NBSP).repeat(count)}
        </mark>,
      );
      index = end;
      continue;
    }
    const mark = visibleWhitespace ? visibleWhitespaceMark(char) : null;
    if (mark) {
      const end = takeRun(value, index, char);
      nodes.push(
        <span key={index} className="text-muted-foreground">
          {mark.repeat(end - index)}
        </span>,
      );
      index = end;
      continue;
    }
    const previous = nodes.at(-1);
    if (typeof previous === "string") nodes[nodes.length - 1] = previous + char;
    else nodes.push(char);
    index += 1;
  }
  return nodes;
}
