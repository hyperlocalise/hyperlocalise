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
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { clientAnalytics } from "@/lib/analytics/client";
import { LOCALISATION_AUDIT_ANALYTICS_EVENTS, scoreBand } from "@/lib/analytics/events";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";
import { isLocalisationAuditSignInCtaEnabled } from "@/lib/flags/localisation-audit-sign-in-ctas";
import type { LocalisationAuditRelatedScore } from "@/lib/localisation-audit/related-scores";
import type { LocalisationAuditStanding } from "@/lib/localisation-audit/store";
import type {
  LocalisationAuditProgressSnapshot,
  LocalisationAuditProgressStage,
  LocalisationAuditReport,
  LocalisationAuditTeaser,
} from "@/lib/localisation-audit/types";

import { getLocalisationAuditResultCopy } from "./localisation-audit-page-content";
import { LocalisationAuditReportView } from "./localisation-audit-report";
import {
  LocalisationAuditBlockedView,
  LocalisationAuditFailedView,
  LocalisationAuditRunningView,
  LocalisationAuditStaleView,
  ReportEmailForm,
} from "./localisation-audit-status-views";

const POLL_INTERVAL_MS = 2500;

type AuditPayload = {
  id: string;
  domainKey: string;
  domainSlug: string;
  sourceUrl: string;
  status: string;
  attemptNumber?: number;
  progressStage?: LocalisationAuditProgressStage | null;
  progressSnapshot?: LocalisationAuditProgressSnapshot | null;
  score: number | null;
  teaser: LocalisationAuditTeaser | null;
  report: LocalisationAuditReport | null;
  unlocked: boolean;
  retryable?: boolean;
  rerunnable?: boolean;
  rerunAvailableAt?: string | null;
  claimed?: boolean;
  errorCode: string | null;
  errorMessage?: string | null;
  completedAt?: string | null;
};

type LocalisationAuditResultProps = {
  locale: string;
  domainSlug: string;
  initialAudit: AuditPayload;
  standing: LocalisationAuditStanding | null;
  relatedScores?: LocalisationAuditRelatedScore[];
  /** Workspace embeds hide marketing unlock/share/claim chrome. */
  variant?: "public" | "workspace";
};

function isInFlight(status: string) {
  return status === "queued" || status === "running";
}

export function LocalisationAuditResult({
  locale,
  domainSlug,
  initialAudit,
  standing,
  relatedScores = [],
  variant = "public",
}: LocalisationAuditResultProps) {
  const copy = getLocalisationAuditResultCopy(locale);
  const router = useRouter();
  const appLocale = normalizeAppLocale(locale) ?? DEFAULT_APP_LOCALE;
  const claimDomainHref = rewriteAppLocalePath(`/claim-domain/${domainSlug}`, appLocale);
  const { user, loading: authLoading, featureFlags } = useAuth();
  const showSignInCtas = isLocalisationAuditSignInCtaEnabled({
    loading: authLoading,
    user,
    featureFlags,
  });
  const [audit, setAudit] = useState(initialAudit);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [rerunPending, setRerunPending] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const teaserTracked = useRef(false);

  // A server refresh after completion delivers the full report; adopt it.
  useEffect(() => {
    setAudit(initialAudit);
  }, [initialAudit]);

  useEffect(() => {
    if (audit.status !== "succeeded" || teaserTracked.current) return;
    teaserTracked.current = true;
    clientAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.teaserView, {
      status: "succeeded",
      score_band: scoreBand(audit.score),
    });
  }, [audit.score, audit.status]);

  useEffect(() => {
    if (!isInFlight(audit.status)) return;

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/localisation-audit/${domainSlug}`);
        if (!response.ok) return;
        const body = (await response.json()) as { audit: AuditPayload };
        setAudit((current) => ({ ...current, ...body.audit, report: body.audit.report ?? null }));
        // The polling payload carries the teaser only; the page render carries the report.
        if (body.audit.status === "succeeded") router.refresh();
      } catch {
        // keep polling
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [audit.status, domainSlug, router]);

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
        setError(body?.message ?? copy.requestEmailError);
        return;
      }
      if (body?.audit) {
        const next = body.audit;
        setAudit((current) => ({ ...current, ...next, report: next.report ?? current.report }));
      }
      setDeliveryMessage(
        body?.delivery?.message ??
          (audit.status === "succeeded" ? copy.unlockQueued : copy.emailWhenReadyQueued),
      );
    } catch {
      setError(copy.requestEmailError);
    } finally {
      setPending(false);
    }
  }

  async function restartAudit(failureMessage: string) {
    setError(null);
    setRerunPending(true);
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
        setError(body?.message ?? failureMessage);
        return;
      }
      setAudit(body.audit);
    } catch {
      setError(failureMessage);
    } finally {
      setRerunPending(false);
    }
  }

  function trackCta(cta: string) {
    clientAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.ctaClick, {
      cta,
      score_band: scoreBand(audit.score),
    });
  }

  async function copyShareLink() {
    const url = `${window.location.origin}/${locale}/localisation-audit/${domainSlug}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage(copy.shareCopied);
      trackCta("share_teaser");
    } catch {
      setShareMessage(url);
    }
  }

  const inFlight = isInFlight(audit.status);
  const emailForm = (
    <ReportEmailForm
      id={inFlight ? "localisation-audit-notify-email" : "localisation-audit-email"}
      email={email}
      onEmailChange={setEmail}
      onSubmit={requestReportEmail}
      pending={pending}
      submitLabel={inFlight ? copy.emailWhenReadySubmit : copy.unlockSubmit}
      pendingLabel={inFlight ? copy.emailWhenReadyPending : copy.unlocking}
      error={error}
      deliveryMessage={deliveryMessage}
      copy={copy}
    />
  );

  if (inFlight && audit.retryable) {
    return (
      <LocalisationAuditStaleView
        domainKey={audit.domainKey}
        copy={copy}
        error={error}
        pending={rerunPending}
        onRetry={() => restartAudit(copy.retryError)}
      />
    );
  }

  if (inFlight) {
    return (
      <LocalisationAuditRunningView
        domainKey={audit.domainKey}
        progressStage={audit.progressStage}
        progressSnapshot={audit.progressSnapshot}
        copy={copy}
        emailForm={emailForm}
      />
    );
  }

  if (audit.status === "failed") {
    return (
      <LocalisationAuditFailedView
        domainKey={audit.domainKey}
        errorMessage={audit.errorMessage}
        copy={copy}
        error={error}
        pending={rerunPending}
        onRetry={() => restartAudit(copy.retryError)}
      />
    );
  }

  if (audit.status === "blocked") {
    return (
      <LocalisationAuditBlockedView
        domainKey={audit.domainKey}
        newAuditHref={rewriteAppLocalePath("/localisation-audit", appLocale)}
        copy={copy}
      />
    );
  }

  return (
    <LocalisationAuditReportView
      audit={audit}
      standing={standing}
      relatedScores={relatedScores}
      copy={copy}
      locale={locale}
      appLocale={appLocale}
      isWorkspace={variant === "workspace"}
      showSignInCtas={showSignInCtas}
      claimDomainHref={claimDomainHref}
      demoHref={REQUEST_DEMO_URL}
      leaderboardHref={`/${locale}/localisation-audit#leaderboard`}
      actions={{
        onShare: copyShareLink,
        shareMessage,
        onRerun: () => restartAudit(copy.rerunError),
        rerunPending,
        error,
        onTrackCta: trackCta,
        emailForm,
      }}
    />
  );
}
