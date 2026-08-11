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

import { LocalisationAuditPage } from "@/components/marketing/localisation-audit/localisation-audit-page";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { listLocalisationAuditLeaderboard } from "@/lib/localisation-audit/store";
import { getLocalizedAlternates } from "@/lib/seo/localized-alternates";

import { getLocalisationAuditRouteMetadata } from "./localisation-audit-route-metadata";

type LocalisationAuditRouteProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: LocalisationAuditRouteProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const intl = getIntlShape(locale);
  const metadata = getLocalisationAuditRouteMetadata(intl);

  return {
    title: metadata.title,
    description: metadata.description,
    alternates: getLocalizedAlternates({ locale, path: "/localisation-audit" }),
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      type: "website",
    },
  };
}

export default async function LocalisationAuditRoutePage({ params }: LocalisationAuditRouteProps) {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  let leaderboard: Awaited<ReturnType<typeof listLocalisationAuditLeaderboard>> = [];
  try {
    leaderboard = await listLocalisationAuditLeaderboard(25);
  } catch {
    leaderboard = [];
  }
  return <LocalisationAuditPage locale={locale} leaderboard={leaderboard} />;
}
