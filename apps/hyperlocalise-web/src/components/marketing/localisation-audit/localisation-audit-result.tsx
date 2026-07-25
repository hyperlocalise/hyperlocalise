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
import { useEffect, useRef, useState, type FormEvent } from "react";

import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypographyH1, TypographyH2, TypographyP } from "@/components/ui/typography";
import { clientAnalytics } from "@/lib/analytics/client";
import { LOCALISATION_AUDIT_ANALYTICS_EVENTS, scoreBand } from "@/lib/analytics/events";
import type {
  LocalisationAuditFinding,
  LocalisationAuditProgressStage,
  LocalisationAuditReport,
  LocalisationAuditTeaser,
} from "@/lib/localisation-audit/types";

import { getLocalisationAuditResultCopy, interpretScore } from "./localisation-audit-page-content";

type AuditPayload = {
  id: string;
  domainKey: string;
  domainSlug: string;
  sourceUrl: string;
  status: string;
  attemptNumber?: number;
  progressStage?: LocalisationAuditProgressStage | null;
  score: number | null;
  teaser: LocalisationAuditTeaser | null;
  report: LocalisationAuditReport | null;
  unlocked: boolean;
  retryable?: boolean;
  errorCode: string | null;
  errorMessage?: string | null;
  completedAt?: string | null;
};

type LocalisationAuditResultProps = {
  locale: string;
  domainSlug: string;
  initialAudit: AuditPayload;
};

const PROGRESS_STAGES = ["queued", "preparing", "crawling", "analyzing", "scoring"] as const;

function FindingList({ findings }: { findings: LocalisationAuditFinding[] }) {
  if (findings.length === 0) {
    return <p className="text-muted-foreground">No findings in this section.</p>;
  }

  return (
    <ul className="space-y-6">
      {findings.map((finding) => (
        <li key={finding.id} className="border-t border-border pt-6 first:border-t-0 first:pt-0">
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            {finding.severity} · {finding.category}
          </p>
          <p className="mt-2 text-lg font-medium">{finding.title}</p>
          <p className="mt-1 text-muted-foreground">{finding.summary}</p>
          {finding.url ? (
            <p className="mt-2 break-all text-sm text-muted-foreground">{finding.url}</p>
          ) : null}
          {finding.evidence ? (
            <p className="mt-2 text-sm text-muted-foreground italic">“{finding.evidence}”</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function stageIndex(stage: LocalisationAuditProgressStage | null | undefined) {
  if (!stage) return 0;
  const index = (PROGRESS_STAGES as readonly string[]).indexOf(stage);
  return index >= 0 ? index : 0;
}

function prioritizeFindings(findings: LocalisationAuditFinding[]) {
  const weight = { critical: 0, warning: 1, info: 2 } as const;
  return findings.toSorted((a, b) => weight[a.severity] - weight[b.severity]).slice(0, 3);
}

export function LocalisationAuditResult({
  locale,
  domainSlug,
  initialAudit,
}: LocalisationAuditResultProps) {
  const copy = getLocalisationAuditResultCopy(locale);
  const [audit, setAudit] = useState(initialAudit);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const teaserTracked = useRef(false);

  useEffect(() => {
    if (audit.status !== "succeeded" || teaserTracked.current) return;
    teaserTracked.current = true;
    clientAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.teaserView, {
      status: "succeeded",
      score_band: scoreBand(audit.score),
    });
  }, [audit.score, audit.status]);

  useEffect(() => {
    if (audit.status === "succeeded" || audit.status === "failed") {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/localisation-audit/${domainSlug}`);
        if (!response.ok) return;
        const body = (await response.json()) as { audit: AuditPayload };
        setAudit(body.audit);
      } catch {
        // keep polling
      }
    }, 2500);

    return () => window.clearInterval(timer);
  }, [audit.status, domainSlug]);

  async function requestReportEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDeliveryMessage(null);
    setPending(true);
    try {
      const response = await fetch(`/api/localisation-audit/${domainSlug}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      const body = (await response.json().catch(() => null)) as {
        audit?: AuditPayload;
        delivery?: { message?: string; status?: string };
        message?: string;
      } | null;
      if (!response.ok) {
        setError(body?.message ?? "Could not request the report email.");
        return;
      }
      if (body?.audit) setAudit(body.audit);
      setDeliveryMessage(
        body?.delivery?.message ??
          (audit.status === "succeeded" ? copy.unlockQueued : copy.emailWhenReadyQueued),
      );
    } catch {
      setError("Could not request the report email.");
    } finally {
      setPending(false);
    }
  }

  async function onRetry() {
    setError(null);
    setRetryPending(true);
    try {
      const response = await fetch("/api/localisation-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: audit.sourceUrl }),
      });
      const body = (await response.json().catch(() => null)) as {
        audit?: AuditPayload;
        message?: string;
      } | null;
      if (!response.ok || !body?.audit) {
        setError(body?.message ?? "Could not retry the audit.");
        return;
      }
      setAudit(body.audit);
    } catch {
      setError("Could not retry the audit.");
    } finally {
      setRetryPending(false);
    }
  }

  function trackCta(cta: string) {
    clientAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.ctaClick, {
      cta,
      score_band: scoreBand(audit.score),
    });
  }

  if ((audit.status === "queued" || audit.status === "running") && audit.retryable) {
    return (
      <section className="px-5 pt-16 pb-20 sm:px-8 sm:pt-20 lg:px-10">
        <TypographyH1>{copy.staleTitle}</TypographyH1>
        <TypographyP className="mt-4 max-w-2xl text-lg text-muted-foreground">
          {copy.staleBody}
        </TypographyP>
        <p className="mt-6 text-sm text-muted-foreground">{audit.domainKey}</p>
        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
        <Button className="mt-8" onClick={onRetry} disabled={retryPending}>
          {retryPending ? copy.retrying : copy.retry}
        </Button>
      </section>
    );
  }

  if (audit.status === "queued" || audit.status === "running") {
    const activeIndex = stageIndex(audit.progressStage);
    return (
      <section className="px-5 pt-16 pb-20 sm:px-8 sm:pt-20 lg:px-10">
        <TypographyH1>{copy.runningTitle}</TypographyH1>
        <TypographyP className="mt-4 max-w-2xl text-lg text-muted-foreground">
          {copy.runningBody}
        </TypographyP>
        <p className="mt-2 text-sm text-muted-foreground">{copy.expectedDuration}</p>
        <p className="mt-6 text-sm text-muted-foreground">{audit.domainKey}</p>

        <ol className="mt-10 flex flex-wrap gap-3">
          {PROGRESS_STAGES.map((stage, index) => {
            const labels = {
              queued: copy.progressQueued,
              preparing: copy.progressPreparing,
              crawling: copy.progressCrawling,
              analyzing: copy.progressAnalyzing,
              scoring: copy.progressScoring,
            } as const;
            const active = index <= activeIndex;
            return (
              <li
                key={stage}
                className={`rounded-full border px-3 py-1 text-sm ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground"
                }`}
              >
                {labels[stage]}
              </li>
            );
          })}
        </ol>

        <div className="mt-12 max-w-md">
          <TypographyH2 className="pb-0 text-xl">{copy.emailWhenReadyHeading}</TypographyH2>
          <TypographyP className="mt-3 text-muted-foreground">
            {copy.emailWhenReadyBody}
          </TypographyP>
          <form onSubmit={requestReportEmail} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="localisation-audit-notify-email">{copy.emailLabel}</Label>
              <Input
                id="localisation-audit-notify-email"
                type="email"
                required
                autoComplete="email"
                placeholder={copy.emailPlaceholder}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {deliveryMessage ? (
              <p className="text-sm text-muted-foreground">{deliveryMessage}</p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? copy.emailWhenReadyPending : copy.emailWhenReadySubmit}
            </Button>
          </form>
        </div>
      </section>
    );
  }

  if (audit.status === "failed") {
    return (
      <section className="px-5 pt-16 pb-20 sm:px-8 sm:pt-20 lg:px-10">
        <TypographyH1>{copy.failedTitle}</TypographyH1>
        <TypographyP className="mt-4 max-w-2xl text-lg text-muted-foreground">
          {copy.failedBody}
        </TypographyP>
        <TypographyP className="mt-2 max-w-2xl text-muted-foreground">
          {audit.errorMessage ?? audit.errorCode ?? "The audit could not finish for this domain."}
        </TypographyP>
        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
        <Button className="mt-8" onClick={onRetry} disabled={retryPending}>
          {retryPending ? copy.retrying : copy.retry}
        </Button>
      </section>
    );
  }

  const teaser = audit.teaser;
  const report = audit.unlocked ? audit.report : null;
  const score = audit.score ?? teaser?.score ?? null;
  const band = interpretScore(score);
  const interpretation =
    band === "high"
      ? copy.scoreInterpretationHigh
      : band === "mid"
        ? copy.scoreInterpretationMid
        : copy.scoreInterpretationLow;
  const fixFirst = prioritizeFindings(teaser?.headlineFindings ?? report?.findings ?? []);
  const ctaBody =
    band === "high"
      ? copy.reauditBodyHigh
      : band === "mid"
        ? copy.reauditBodyMid
        : copy.reauditBodyLow;
  const freshness = audit.completedAt ?? teaser?.completedAt ?? null;

  return (
    <>
      <section className="px-5 pt-16 pb-12 sm:px-8 sm:pt-20 lg:px-10">
        <p className="text-sm text-muted-foreground">{audit.domainKey}</p>
        <TypographyH1 className="mt-3">
          {copy.scoreLabel}: {score ?? "—"}
          <span className="text-muted-foreground">{copy.scoreOutOf}</span>
        </TypographyH1>
        <TypographyP className="mt-4 max-w-2xl text-lg text-muted-foreground">
          {interpretation}
        </TypographyP>
        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
          {freshness ? (
            <span>
              {copy.freshnessLabel}: {new Date(freshness).toLocaleDateString()}
            </span>
          ) : null}
          <span>
            {copy.scopeLabel}: {copy.scopeBody}
          </span>
          <span>
            {copy.confidenceLabel}: {copy.confidenceBody}
          </span>
        </div>
        <TypographyP className="mt-4 max-w-2xl text-muted-foreground">
          Sampled {teaser?.pagesCrawled ?? report?.pagesCrawled ?? 0} pages for technical and
          linguistic localisation signals.
        </TypographyP>
      </section>

      <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
        <TypographyH2 className="pb-0">{copy.fixFirstHeading}</TypographyH2>
        <div className="mt-8">
          <FindingList findings={fixFirst} />
        </div>
      </section>

      <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
        <TypographyH2 className="pb-0">{copy.localesHeading}</TypographyH2>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {(teaser?.detectedLocales ?? report?.detectedLocales ?? []).map((localeSignal) => (
            <span key={`${localeSignal.locale}-${localeSignal.source}`}>
              {localeSignal.locale}{" "}
              <span className="text-muted-foreground/70">({localeSignal.source})</span>
            </span>
          ))}
        </div>
      </section>

      <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
        <TypographyH2 className="pb-0">{copy.findingsHeading}</TypographyH2>
        <div className="mt-8">
          <FindingList findings={teaser?.headlineFindings ?? []} />
        </div>
      </section>

      {!audit.unlocked ? (
        <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
          <TypographyH2 className="pb-0">{copy.unlockHeading}</TypographyH2>
          <TypographyP className="mt-4 max-w-2xl text-muted-foreground">
            {copy.unlockBody}
          </TypographyP>
          <form onSubmit={requestReportEmail} className="mt-8 max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="localisation-audit-email">{copy.emailLabel}</Label>
              <Input
                id="localisation-audit-email"
                type="email"
                required
                autoComplete="email"
                placeholder={copy.emailPlaceholder}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {deliveryMessage ? (
              <p className="text-sm text-muted-foreground">{deliveryMessage}</p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? copy.unlocking : copy.unlockSubmit}
            </Button>
          </form>
        </section>
      ) : null}

      {report ? (
        <>
          <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
            <TypographyH2 className="pb-0">{copy.fullFindingsHeading}</TypographyH2>
            <div className="mt-8">
              <FindingList findings={report.findings} />
            </div>
          </section>

          {report.linguisticNotes.length > 0 ? (
            <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
              <TypographyH2 className="pb-0">{copy.linguisticHeading}</TypographyH2>
              <ul className="mt-8 space-y-8">
                {report.linguisticNotes.map((note) => (
                  <li key={note.locale}>
                    <p className="text-lg font-medium">{note.locale}</p>
                    <p className="mt-2 text-muted-foreground">{note.summary}</p>
                    <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                      {note.samples.map((sample) => (
                        <li key={`${note.locale}-${sample.text}`}>
                          <p className="italic">“{sample.text}”</p>
                          <p className="mt-1">{sample.note}</p>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
            <TypographyH2 className="pb-0">{copy.pagesHeading}</TypographyH2>
            <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
              {report.pages.map((page) => (
                <li key={page.url} className="break-all">
                  {page.status} · {page.url}
                  {page.htmlLang ? ` · lang=${page.htmlLang}` : ""}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
        <TypographyH2 className="pb-0">{copy.reauditHeading}</TypographyH2>
        <TypographyP className="mt-4 max-w-2xl text-muted-foreground">{ctaBody}</TypographyP>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            nativeButton={false}
            render={<Link href="/auth/sign-in" onClick={() => trackCta("create_workspace")} />}
          >
            {band === "low" ? copy.createWorkspace : copy.deeperAudit}
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <a
                href={REQUEST_DEMO_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackCta("book_review")}
              />
            }
          >
            {copy.bookReview}
          </Button>
        </div>
      </section>
    </>
  );
}
