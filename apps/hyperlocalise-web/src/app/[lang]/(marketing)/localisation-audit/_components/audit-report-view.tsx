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
  ArrowRight01Icon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  LockIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useIntl } from "react-intl";

import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/primitives/cn";

import type {
  AuditFinding,
  AuditReportProjection,
  AuditSummary,
  ScoreResult,
} from "./localisation-audit-types";
import { localisationAuditMessages as messages } from "./localisation-audit.messages";

type AuditReportViewProps = {
  report: AuditSummary | AuditReportProjection;
  mode: "preview" | "public" | "private";
  showFooter?: boolean;
  children?: React.ReactNode;
};

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function ScoreCard({
  label,
  score,
  featured = false,
}: {
  label: string;
  score: ScoreResult;
  featured?: boolean;
}) {
  const intl = useIntl();

  return (
    <Card className={featured ? "bg-primary text-primary-foreground ring-primary" : undefined}>
      <CardHeader>
        <CardTitle className={featured ? "text-primary-foreground" : undefined}>{label}</CardTitle>
        <CardAction>
          {score.state === "scored" ? (
            <span className="text-3xl font-semibold tabular-nums">{score.score}</span>
          ) : (
            <Badge
              variant="outline"
              className={featured ? "border-primary-foreground/30" : undefined}
            >
              {intl.formatMessage(messages.insufficientEvidence)}
            </Badge>
          )}
        </CardAction>
        <CardDescription className={featured ? "text-primary-foreground/75" : undefined}>
          {intl.formatMessage(messages.evaluatedRules, {
            count: score.evaluatedRules,
          })}
        </CardDescription>
      </CardHeader>
      {score.state === "scored" ? (
        <CardContent>
          <Progress
            value={score.score}
            aria-label={`${label}: ${score.score} out of 100`}
            className={
              featured
                ? "[&_[data-slot=progress-indicator]]:bg-primary-foreground [&_[data-slot=progress-track]]:bg-primary-foreground/20"
                : undefined
            }
          >
            <ProgressLabel className="sr-only">{label}</ProgressLabel>
            <ProgressValue className="sr-only" />
          </Progress>
        </CardContent>
      ) : null}
    </Card>
  );
}

function FindingCard({ finding, index }: { finding: AuditFinding; index: number }) {
  const intl = useIntl();
  const hasEvidence = finding.evidence.trim().length > 0;
  const confidence =
    typeof finding.confidence === "number"
      ? finding.confidence <= 1
        ? intl.formatNumber(finding.confidence, { style: "percent" })
        : intl.formatNumber(finding.confidence)
      : humanize(finding.confidence);

  return (
    <Card size="sm">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>
          <Badge variant="outline">{humanize(finding.category)}</Badge>
          <Badge
            variant={finding.severity.toLowerCase() === "critical" ? "destructive" : "secondary"}
          >
            {humanize(finding.severity)}
          </Badge>
          {confidence ? (
            <Badge variant="ghost">
              {intl.formatMessage(messages.confidence, { value: confidence })}
            </Badge>
          ) : null}
        </div>
        <CardTitle className="mt-2 text-lg">{finding.title}</CardTitle>
      </CardHeader>
      <CardContent className={cn("grid gap-5", hasEvidence ? "md:grid-cols-3" : "md:grid-cols-2")}>
        {hasEvidence ? (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-balance">
              {intl.formatMessage(messages.evidence)}
            </h3>
            <p className="text-sm leading-6 text-pretty text-muted-foreground">
              {finding.evidence}
            </p>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold text-balance">
            {intl.formatMessage(messages.businessImpact)}
          </h3>
          <p className="text-sm leading-6 text-pretty text-muted-foreground">
            {finding.businessImpact}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold text-balance">
            {intl.formatMessage(messages.recommendation)}
          </h3>
          <p className="text-sm leading-6 text-pretty text-muted-foreground">
            {finding.recommendation}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConversionCta() {
  const intl = useIntl();

  return (
    <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="flex max-w-2xl flex-col gap-3">
          <h2 className="font-heading text-3xl font-semibold text-balance">
            {intl.formatMessage(messages.strategyTitle)}
          </h2>
          <p className="text-base leading-7 text-pretty text-muted-foreground">
            {intl.formatMessage(messages.strategyDescription)}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            nativeButton={false}
            render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
          >
            {intl.formatMessage(messages.bookCall)}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} data-icon="inline-end" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<a href="/auth/sign-in?returnTo=%2Fauth%2Fonboarding" />}
          >
            {intl.formatMessage(messages.createWorkspace)}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function AuditReportView({
  report,
  mode,
  showFooter = false,
  children,
}: AuditReportViewProps) {
  const intl = useIntl();
  const availableFindings =
    mode === "private" && "findings" in report ? report.findings : report.previewFindings;
  const findings = mode === "private" ? availableFindings : availableFindings.slice(0, 3);
  const parsedDate = new Date(report.auditedAt);
  const auditDate = Number.isNaN(parsedDate.valueOf())
    ? report.auditedAt
    : intl.formatDate(parsedDate, { dateStyle: "long" });

  return (
    <div className="bg-background text-foreground">
      <div className="mx-auto max-w-7xl">
        <section className="grid gap-10 px-5 pb-14 pt-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:px-10 lg:pb-18 lg:pt-16">
          <div className="flex max-w-3xl flex-col gap-5">
            <Badge variant="outline">{intl.formatMessage(messages.reportEyebrow)}</Badge>
            <div className="flex flex-col gap-3">
              <h1 className="font-heading text-4xl font-semibold text-balance sm:text-5xl">
                {report.domain || intl.formatMessage(messages.reportTitle)}
              </h1>
              <p className="flex items-center gap-2 text-sm text-pretty text-muted-foreground">
                <HugeiconsIcon
                  icon={Calendar03Icon}
                  strokeWidth={1.8}
                  className="size-4"
                  aria-hidden="true"
                />
                {intl.formatMessage(messages.auditedOn, { date: auditDate })}
              </p>
            </div>
          </div>
          <div className="hidden size-20 items-center justify-center rounded-full border border-border bg-muted/40 lg:flex">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={1.5}
              className="size-9 text-primary"
              aria-hidden="true"
            />
          </div>
        </section>

        <section className="border-t border-border px-5 py-14 sm:px-8 lg:px-10 lg:py-18">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <ScoreCard
              label={intl.formatMessage(messages.overallScore)}
              score={report.overallScore}
              featured
            />
            <ScoreCard
              label={intl.formatMessage(messages.technical)}
              score={report.categories.technical}
            />
            <ScoreCard
              label={intl.formatMessage(messages.linguistic)}
              score={report.categories.linguistic}
            />
            <ScoreCard
              label={intl.formatMessage(messages.market)}
              score={report.categories.market}
            />
          </div>
        </section>

        <section className="border-t border-border px-5 py-14 sm:px-8 lg:px-10 lg:py-18">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">
                {mode === "private"
                  ? intl.formatMessage(messages.reportTitle)
                  : intl.formatMessage(messages.reportEyebrow)}
              </p>
              <h2 className="font-heading mt-2 text-3xl font-semibold text-balance">
                {intl.formatMessage(
                  mode === "private" ? messages.allFindings : messages.previewFindings,
                )}
              </h2>
            </div>
            {mode !== "private" && report.lockedFindingCount > 0 ? (
              <div className="flex items-center gap-2 text-sm text-pretty text-muted-foreground">
                <HugeiconsIcon
                  icon={LockIcon}
                  strokeWidth={1.8}
                  className="size-4"
                  aria-hidden="true"
                />
                {intl.formatMessage(messages.lockedFindings, {
                  count: report.lockedFindingCount,
                })}
              </div>
            ) : null}
          </div>

          {findings.length > 0 ? (
            <div className="grid gap-4">
              {findings.map((finding, index) => (
                <FindingCard key={finding.id} finding={finding} index={index} />
              ))}
            </div>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>{intl.formatMessage(messages.previewFindings)}</EmptyTitle>
                <EmptyDescription>
                  {intl.formatMessage(messages.reportUnavailable)}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {children ? (
            <>
              <Separator className="my-10" />
              {children}
            </>
          ) : null}
        </section>

        {mode === "private" && report.limitations.length > 0 ? (
          <section className="border-t border-border px-5 py-14 sm:px-8 lg:px-10 lg:py-18">
            <Card>
              <CardHeader>
                <CardTitle>{intl.formatMessage(messages.limitations)}</CardTitle>
                <CardDescription className="text-pretty">
                  {intl.formatMessage(messages.limitationsDescription)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-3">
                  {report.limitations.map((limitation) => (
                    <li
                      key={limitation}
                      className="flex gap-3 text-sm leading-6 text-pretty text-muted-foreground"
                    >
                      <span
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                      {limitation}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="border-t text-xs text-muted-foreground">
                {intl.formatMessage(messages.missingEvidenceNote)}
              </CardFooter>
            </Card>
          </section>
        ) : null}

        <ConversionCta />

        {showFooter ? (
          <section className="border-t border-border">
            <div className="px-5 pt-16 sm:px-8 lg:px-10">
              <MarketingFooter columns={footerColumns} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
