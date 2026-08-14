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
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { LocalisationAuditResultPage } from "@/components/marketing/localisation-audit/localisation-audit-result-page";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { isValidDomainSlug } from "@/lib/localisation-audit/domain-slug";
import {
  localisationAuditUnlockCookieName,
  verifyLocalisationAuditUnlock,
} from "@/lib/localisation-audit/email-unlock";
import {
  findLocalisationAuditBySlug,
  getLocalisationAuditStanding,
  isLocalisationAuditRetryable,
  isLocalisationAuditRerunnable,
  localisationAuditRerunAvailableAt,
} from "@/lib/localisation-audit/store";
import { getLocalizedAlternates } from "@/lib/seo/localized-alternates";

import { getLocalisationAuditResultRouteMetadata } from "../localisation-audit-route-metadata";

type LocalisationAuditResultRouteProps = {
  params: Promise<{ lang: string; domainSlug: string }>;
};

export async function generateMetadata({
  params,
}: LocalisationAuditResultRouteProps): Promise<Metadata> {
  const { lang, domainSlug } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  if (!isValidDomainSlug(domainSlug)) {
    return { title: "Localisation audit | Hyperlocalise" };
  }

  const audit = await findLocalisationAuditBySlug(domainSlug);
  if (!audit) {
    return { title: "Localisation audit | Hyperlocalise" };
  }

  const intl = getIntlShape(locale);
  const metadata = getLocalisationAuditResultRouteMetadata(intl, audit.domainKey, audit.score);
  const robots =
    audit.status === "succeeded" ? { index: true, follow: true } : { index: false, follow: false };

  return {
    title: metadata.title,
    description: metadata.description,
    robots,
    alternates: getLocalizedAlternates({
      locale,
      path: `/localisation-audit/${domainSlug}`,
    }),
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      type: "website",
    },
  };
}

export default async function LocalisationAuditResultRoutePage({
  params,
}: LocalisationAuditResultRouteProps) {
  const { lang, domainSlug } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  if (!isValidDomainSlug(domainSlug)) {
    notFound();
  }

  const audit = await findLocalisationAuditBySlug(domainSlug);
  if (!audit) {
    notFound();
  }

  const cookieStore = await cookies();
  const unlock = verifyLocalisationAuditUnlock(
    cookieStore.get(localisationAuditUnlockCookieName(domainSlug))?.value,
    domainSlug,
  );
  const unlocked = unlock != null && audit.status === "succeeded";
  const standing =
    audit.status === "succeeded" && audit.score != null
      ? await getLocalisationAuditStanding({
          domainSlug: audit.domainSlug,
          score: audit.score,
        }).catch(() => null)
      : null;

  return (
    <LocalisationAuditResultPage
      locale={locale}
      domainSlug={domainSlug}
      standing={standing}
      audit={{
        id: audit.id,
        domainKey: audit.domainKey,
        domainSlug: audit.domainSlug,
        sourceUrl: audit.sourceUrl,
        status: audit.status,
        attemptNumber: audit.attemptNumber,
        progressStage: audit.progressStage,
        score: audit.score,
        teaser: audit.teaser,
        report: unlocked ? audit.report : null,
        unlocked,
        retryable: isLocalisationAuditRetryable(audit),
        rerunnable: isLocalisationAuditRerunnable(audit),
        rerunAvailableAt: localisationAuditRerunAvailableAt(audit)?.toISOString() ?? null,
        errorCode: audit.errorCode,
        errorMessage: audit.errorMessage,
        completedAt: audit.completedAt?.toISOString() ?? null,
      }}
    />
  );
}
