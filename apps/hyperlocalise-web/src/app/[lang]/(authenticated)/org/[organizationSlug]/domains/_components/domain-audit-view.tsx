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
import { FormattedDate, FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { isLiveDomainResearchId } from "@/lib/domains/research-prototype";
import {
  LOCALISATION_DEEP_AUDIT_DEFAULT_PAGE_LIMIT,
  type LocalisationDeepAuditRunListItem,
  type LocalisationDeepAuditStatus,
} from "@/lib/localisation-audit/deep/types";
import type { LocalisationAuditDimension } from "@/lib/localisation-audit/types";

import { DomainAuditFindings } from "./domain-audit-findings";
import { domainAuditViewMessages as messages } from "./domain-audit-view.messages";
import { DomainResearchEmpty } from "./domain-research-empty";
import {
  isDeepAuditInFlight,
  useDeepAuditActions,
  useDomainDeepAudits,
} from "./use-domain-deep-audits";

const DIMENSIONS: Array<{ key: LocalisationAuditDimension; label: MessageDescriptor }> = [
  { key: "technical", label: messages.dimensionTechnical },
  { key: "linguistic", label: messages.dimensionLinguistic },
  { key: "contextual", label: messages.dimensionContextual },
  { key: "visual", label: messages.dimensionVisual },
];

function statusMessage(status: LocalisationDeepAuditStatus) {
  switch (status) {
    case "queued":
      return messages.statusQueued;
    case "crawling":
      return messages.statusCrawling;
    case "scoring":
      return messages.statusScoring;
    case "succeeded":
      return messages.statusSucceeded;
    case "failed":
      return messages.statusFailed;
    default:
      return messages.statusCancelled;
  }
}

function statusVariant(status: LocalisationDeepAuditStatus) {
  if (status === "succeeded") return "success" as const;
  if (status === "failed") return "destructive" as const;
  if (status === "cancelled") return "outline" as const;
  return "secondary" as const;
}

function StatusBadge({ status }: { status: LocalisationDeepAuditStatus }) {
  return (
    <Badge variant={statusVariant(status)}>
      <FormattedMessage {...statusMessage(status)} />
    </Badge>
  );
}

function Metric({ label, value }: { label: MessageDescriptor; value: string }) {
  return (
    <div className="grid gap-0.5">
      <TypographyP size="small" tone="subtle">
        <FormattedMessage {...label} />
      </TypographyP>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function RunProgress({ run }: { run: LocalisationDeepAuditRunListItem }) {
  const discovered = Math.max(run.pagesDiscovered, run.pagesRendered);
  const percent = discovered > 0 ? Math.round((run.pagesRendered / discovered) * 100) : 0;
  return (
    <div className="grid gap-2">
      <Progress value={run.status === "scoring" ? 100 : percent} />
      <TypographyP size="small" tone="subtle">
        <FormattedMessage
          {...messages.progress}
          values={{ rendered: run.pagesRendered, discovered }}
        />
      </TypographyP>
    </div>
  );
}

function RunSummary({ run }: { run: LocalisationDeepAuditRunListItem }) {
  const intl = useIntl();
  const format = (value: number | null | undefined) =>
    value == null ? "–" : intl.formatNumber(value);
  return (
    <Card size="sm" className="rounded-lg border border-border bg-card py-0 ring-0">
      <CardContent className="grid gap-4 p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          <Metric label={messages.scoreLabel} value={format(run.score)} />
          {DIMENSIONS.map((dimension) => (
            <Metric
              key={dimension.key}
              label={dimension.label}
              value={format(run.dimensionScores?.[dimension.key])}
            />
          ))}
          <Metric label={messages.pagesLabel} value={format(run.pagesRendered)} />
        </div>
        <div className="grid gap-1">
          <TypographyP size="small" className="font-medium">
            <FormattedMessage {...messages.diffTitle} />
          </TypographyP>
          <TypographyP size="small" tone="subtle">
            {run.diff ? (
              <FormattedMessage {...messages.diffSummary} values={run.diff} />
            ) : (
              <FormattedMessage {...messages.diffFirstRun} />
            )}
          </TypographyP>
        </div>
      </CardContent>
    </Card>
  );
}

function RunHistory({
  runs,
  selectedId,
  onSelect,
}: {
  runs: LocalisationDeepAuditRunListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Card size="sm" className="rounded-lg border border-border bg-card py-0 ring-0">
      <CardContent className="grid gap-2 p-4">
        <TypographyH2 className="text-base">
          <FormattedMessage {...messages.runsTitle} />
        </TypographyH2>
        <ul>
          {runs.map((run) => (
            <li
              key={run.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
            >
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="tabular-nums">
                  <FormattedDate value={run.createdAt} dateStyle="medium" timeStyle="short" />
                </span>
                <StatusBadge status={run.status} />
                {run.score != null ? (
                  <span className="text-muted-foreground">
                    <FormattedMessage {...messages.runScore} values={{ score: run.score }} />
                  </span>
                ) : null}
                <span className="text-muted-foreground">
                  <FormattedMessage {...messages.runPages} values={{ count: run.pagesRendered }} />
                </span>
                {run.diff ? (
                  <span className="text-muted-foreground">
                    <FormattedMessage {...messages.diffSummary} values={run.diff} />
                  </span>
                ) : null}
              </div>
              {run.status === "succeeded" ? (
                run.id === selectedId ? (
                  <TypographyP size="small" tone="subtle">
                    <FormattedMessage {...messages.viewingRun} />
                  </TypographyP>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => onSelect(run.id)}>
                    <FormattedMessage {...messages.viewRun} />
                  </Button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function DomainAuditView({
  organizationSlug,
  linkedDomainId,
  canRun,
}: {
  organizationSlug: string;
  linkedDomainId: string;
  canRun: boolean;
}) {
  const intl = useIntl();
  const live = isLiveDomainResearchId(linkedDomainId);
  const runsQuery = useDomainDeepAudits({ organizationSlug, linkedDomainId, enabled: live });
  const { start, cancel } = useDeepAuditActions({ organizationSlug, linkedDomainId });
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  if (!live) {
    return (
      <DomainResearchEmpty
        title={<FormattedMessage {...messages.prototypeTitle} />}
        description={<FormattedMessage {...messages.prototypeDescription} />}
      />
    );
  }
  if (runsQuery.isPending) {
    return <Spinner />;
  }
  if (runsQuery.isError) {
    return (
      <TypographyP size="small" tone="subtle">
        <FormattedMessage {...messages.loadError} />
      </TypographyP>
    );
  }

  const runs = runsQuery.data;
  const latest = runs[0] ?? null;
  const inFlight = latest && isDeepAuditInFlight(latest.status) ? latest : null;
  const selected =
    runs.find((run) => run.id === selectedRunId && run.status === "succeeded") ??
    runs.find((run) => run.status === "succeeded") ??
    null;

  const runAudit = () =>
    start.mutate(undefined, {
      onError: (error) => toast.error(error.message || intl.formatMessage(messages.startFailed)),
    });

  const runButton = canRun ? (
    <Button size="sm" onClick={runAudit} disabled={start.isPending || inFlight !== null}>
      <FormattedMessage {...messages.runAudit} />
    </Button>
  ) : null;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid max-w-2xl gap-1">
          <TypographyH2 className="text-lg">
            <FormattedMessage {...messages.title} />
          </TypographyH2>
          <TypographyP size="small" tone="subtle">
            <FormattedMessage
              {...messages.intro}
              values={{
                pageLimit: latest?.pageLimit ?? LOCALISATION_DEEP_AUDIT_DEFAULT_PAGE_LIMIT,
              }}
            />
          </TypographyP>
        </div>
        {runs.length > 0 ? runButton : null}
      </div>

      {inFlight ? (
        <Card size="sm" className="rounded-lg border border-border bg-card py-0 ring-0">
          <CardContent className="grid gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge status={inFlight.status} />
              {canRun ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(inFlight.id)}
                >
                  <FormattedMessage {...messages.cancelRun} />
                </Button>
              ) : null}
            </div>
            <RunProgress run={inFlight} />
          </CardContent>
        </Card>
      ) : null}

      {latest?.status === "failed" || latest?.status === "cancelled" ? (
        <Card size="sm" className="rounded-lg border border-border bg-card py-0 ring-0">
          <CardContent className="grid gap-1 p-4">
            <TypographyP size="small" className="font-medium">
              <FormattedMessage {...messages.failedTitle} />
            </TypographyP>
            <TypographyP size="small" tone="subtle">
              {latest.status === "cancelled" ? (
                <FormattedMessage {...messages.cancelledDescription} />
              ) : (
                latest.errorMessage
              )}
            </TypographyP>
          </CardContent>
        </Card>
      ) : null}

      {runs.length === 0 ? (
        <DomainResearchEmpty
          title={<FormattedMessage {...messages.emptyTitle} />}
          description={<FormattedMessage {...messages.emptyDescription} />}
          action={runButton}
        />
      ) : null}

      {selected ? (
        <>
          <RunSummary run={selected} />
          <DomainAuditFindings
            key={selected.id}
            organizationSlug={organizationSlug}
            linkedDomainId={linkedDomainId}
            run={selected}
          />
        </>
      ) : null}

      {runs.length > 0 ? (
        <RunHistory runs={runs} selectedId={selected?.id ?? null} onSelect={setSelectedRunId} />
      ) : null}
    </div>
  );
}
