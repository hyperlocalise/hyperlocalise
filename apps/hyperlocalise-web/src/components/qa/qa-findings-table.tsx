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
import { ArrowRightIcon, CaretDownIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { cn } from "@/lib/primitives/cn";
import { contentEditorGuidelineCheckMessages } from "@/components/content-editor/project-file/content-editor-guideline-checks.messages";
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
import { QaSendToLinearMenu } from "./qa-send-to-linear-menu";

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
  const [whitespaceGroups, setWhitespaceGroups] = useState<Set<string>>(new Set());
  // A finding id, or BULK_IGNORE while the bulk bar asks for a custom reason.
  const [ignoringId, setIgnoringId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const eligible = findings.filter((f) => (f.status ?? "open") === "open" && !f.needsRecheck);
  const selected = eligible.filter((f) => selectedIds.has(f.id));
  const promotable = selected.filter((f) => !f.issueIdentifier);
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
  const explainFinding = useMutation({
    mutationFn: (id: string) => client.qaReport.findings.explain(organizationSlug, id),
    onSuccess: async () => {
      await refresh();
    },
    onError: () => {
      toast.error(intl.formatMessage(m.explainError));
    },
  });
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
  const bulkIgnore = useMutation({
    mutationFn: async ({ ids, reason: reviewReason }: { ids: string[]; reason: string }) => {
      for (let offset = 0; offset < ids.length; offset += BULK_REVIEW_BATCH_SIZE) {
        await client.qaReport.findings.reviewMany(organizationSlug, {
          findingIds: ids.slice(offset, offset + BULK_REVIEW_BATCH_SIZE),
          status: "ignored",
          reason: reviewReason,
        });
      }
    },
    onSuccess: async (_, { ids }) => {
      setSelectedIds(new Set());
      setIgnoringId(null);
      setReason("");
      toast.success(intl.formatMessage(m.bulkIgnored, { count: ids.length }));
      await refresh();
    },
    onError: () => {
      toast.error(intl.formatMessage(m.reviewError));
      void refresh();
    },
  });
  const ignoreSelected = (reviewReason: string) =>
    bulkIgnore.mutate({ ids: selected.map((f) => f.id), reason: reviewReason });
  const ignoreOne = (id: string, reviewReason: string) => {
    review.reset();
    review.mutate({ id, status: "ignored", reason: reviewReason });
  };
  const ignoreForm = (onSubmit: () => void) => (
    <form
      className="flex max-w-xl flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Field>
        <FieldLabel htmlFor={`reason-${ignoringId}`}>{intl.formatMessage(m.reason)}</FieldLabel>
        <Input
          id={`reason-${ignoringId}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          autoFocus
          maxLength={1000}
        />
        <FieldDescription>{intl.formatMessage(m.ignoreHelp)}</FieldDescription>
      </Field>
      <div className="flex gap-2">
        <Button
          size="sm"
          type="submit"
          disabled={!reason.trim() || review.isPending || bulkIgnore.isPending}
        >
          {intl.formatMessage(m.saveIgnore)}
        </Button>
        <Button variant="ghost" size="sm" type="button" onClick={() => setIgnoringId(null)}>
          {intl.formatMessage(m.cancel)}
        </Button>
      </div>
    </form>
  );
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
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {canPromote && eligible.length ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
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
              {selected.length
                ? intl.formatMessage(m.selectedCount, { count: selected.length })
                : intl.formatMessage(m.selectAllOpen, { count: eligible.length })}
            </label>
          ) : null}
          {selected.length ? (
            <>
              {promotable.length ? (
                <Button
                  size="sm"
                  disabled={promote.isPending || bulkIgnore.isPending}
                  onClick={() => promote.mutate(promotable.map((f) => f.id))}
                >
                  {intl.formatMessage(m.createSelected, { count: promotable.length })}
                </Button>
              ) : null}
              <QaSendToLinearMenu
                organizationSlug={organizationSlug}
                findingIds={selected.map((f) => f.id)}
                disabled={promote.isPending || bulkIgnore.isPending}
                onSent={() => setSelectedIds(new Set())}
              />
              <QaIgnoreMenu
                label={intl.formatMessage(m.ignoreSelected, { count: selected.length })}
                variant="outline"
                disabled={promote.isPending || bulkIgnore.isPending}
                onIgnore={ignoreSelected}
                onOther={() => {
                  setIgnoringId(BULK_IGNORE);
                  setReason("");
                }}
              />
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                {intl.formatMessage(m.clearSelection)}
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {ignoringId === BULK_IGNORE && selected.length
        ? ignoreForm(() => ignoreSelected(reason))
        : null}
      {review.isError ? <QaNotice message={intl.formatMessage(m.reviewError)} /> : null}
      {[...groups.entries()].map(([groupId, rows]) => {
        const first = rows[0]!;
        const completedAt = lastCompletedByProject?.[first.projectId];
        const canShowWhitespace =
          hasNotableWhitespace(first.sourceText) || hasNotableWhitespace(first.targetText);
        const showWhitespace = canShowWhitespace && whitespaceGroups.has(groupId);
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
              <Button nativeButton={false} render={<Link href={first.editorHref} />} size="sm">
                {intl.formatMessage(m.review)}
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
            <div className="relative grid gap-px border-y border-border bg-border md:grid-cols-2">
              {canShowWhitespace ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="absolute end-2 top-2 z-10"
                  aria-pressed={showWhitespace}
                  onClick={() =>
                    setWhitespaceGroups((current) => {
                      const next = new Set(current);
                      if (next.has(groupId)) next.delete(groupId);
                      else next.add(groupId);
                      return next;
                    })
                  }
                >
                  {intl.formatMessage(showWhitespace ? m.hideWhitespace : m.showWhitespace)}
                </Button>
              ) : null}
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
              const status = finding.status ?? "open";
              const canReviewFinding = canPromote && status !== "resolved" && !finding.needsRecheck;
              return (
                <div
                  key={finding.id}
                  className={cn(
                    "flex flex-col gap-3 border-l-4 px-4 py-3",
                    findingAccentClass(finding),
                  )}
                >
                  <div className="flex items-start gap-3">
                    {canPromote && eligible.some((f) => f.id === finding.id) ? (
                      <Checkbox
                        className="mt-0.5"
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
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <p className="text-sm font-medium whitespace-pre-wrap break-words">
                        {displayMessage}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant={finding.severity === "error" ? "destructive" : "warning"}>
                          {intl.formatMessage(m[finding.severity])}
                        </Badge>
                        <span>{qaCheckLabel(finding.checkType, intl)}</span>
                        {status !== "open" ? (
                          <Badge variant={findingStatusVariant(status)}>
                            {intl.formatMessage(m[status])}
                          </Badge>
                        ) : null}
                        {finding.needsRecheck ? (
                          <Badge variant="outline">{intl.formatMessage(m.needsRecheckBadge)}</Badge>
                        ) : null}
                        {finding.issueIdentifier ? (
                          <Link
                            className="text-foreground underline"
                            href={`/org/${encodeURIComponent(organizationSlug)}/issues/${encodeURIComponent(finding.issueIdentifier)}`}
                          >
                            {intl.formatMessage(m.linkedIssue, {
                              identifier: finding.issueIdentifier,
                            })}
                          </Link>
                        ) : null}
                      </div>
                      {finding.ignoreReason ? (
                        <p className="text-xs text-muted-foreground">{finding.ignoreReason}</p>
                      ) : null}
                      {displayMessage !== finding.message ? (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer">
                            {intl.formatMessage(m.technicalDetails)}
                          </summary>
                          <p className="mt-1 whitespace-pre-wrap break-words">{finding.message}</p>
                        </details>
                      ) : null}
                    </div>
                    {status === "open" &&
                    finding.checkType === "guideline" &&
                    finding.reasoningAvailable &&
                    finding.passageId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={explainFinding.isPending}
                        onClick={() => explainFinding.mutate(finding.id)}
                      >
                        {explainFinding.isPending && explainFinding.variables === finding.id
                          ? intl.formatMessage(contentEditorGuidelineCheckMessages.explaining)
                          : intl.formatMessage(contentEditorGuidelineCheckMessages.explain)}
                      </Button>
                    ) : null}
                    {canReviewFinding && status === "ignored" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={review.isPending}
                        onClick={() => {
                          review.reset();
                          review.mutate({ id: finding.id, status: "open" });
                        }}
                      >
                        {intl.formatMessage(m.undo)}
                      </Button>
                    ) : null}
                    {canReviewFinding && status === "open" ? (
                      <QaIgnoreMenu
                        label={intl.formatMessage(m.ignore)}
                        variant="ghost"
                        disabled={review.isPending || bulkIgnore.isPending}
                        onIgnore={(value) => ignoreOne(finding.id, value)}
                        onOther={() => {
                          review.reset();
                          setIgnoringId(finding.id);
                          setReason("");
                        }}
                      />
                    ) : null}
                  </div>
                  {ignoringId === finding.id
                    ? ignoreForm(() => review.mutate({ id: finding.id, status: "ignored", reason }))
                    : null}
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
const BULK_IGNORE = "bulk";
const BULK_REVIEW_BATCH_SIZE = 100;
const IGNORE_REASONS = [m.ignoreFalsePositive, m.ignoreIntentional, m.ignoreBrandTerm];

/** Spaces that are easy to miss: non-breaking, tabs, line breaks, doubled or at the edges. */
function hasNotableWhitespace(text: string) {
  return /[\u00a0\t\r\n]| {2}|^\s|\s$/.test(text);
}

function QaIgnoreMenu({
  label,
  variant,
  disabled,
  onIgnore,
  onOther,
}: {
  label: string;
  variant: "ghost" | "outline";
  disabled: boolean;
  onIgnore: (reason: string) => void;
  onOther: () => void;
}) {
  const intl = useIntl();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant={variant} size="sm" disabled={disabled} />}
      >
        {label}
        <CaretDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{intl.formatMessage(m.ignoreBecause)}</DropdownMenuLabel>
          {IGNORE_REASONS.map((descriptor) => (
            <DropdownMenuItem
              key={descriptor.id}
              onClick={() => onIgnore(intl.formatMessage(descriptor))}
            >
              {intl.formatMessage(descriptor)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onOther}>{intl.formatMessage(m.ignoreOther)}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
