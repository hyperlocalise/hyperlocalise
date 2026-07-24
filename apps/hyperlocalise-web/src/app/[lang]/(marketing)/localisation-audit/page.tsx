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

import { getIntlShape } from "@/lib/app-i18n/intl";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { getLocalizedAlternates } from "@/lib/seo/localized-alternates";

import { LocalisationAuditFlow } from "./_components/localisation-audit-flow";

type LocalisationAuditPageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: LocalisationAuditPageProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const intl = getIntlShape(locale);
  const title = intl.formatMessage({
    defaultMessage: "Free Localisation Health Audit | Hyperlocalise",
    id: "kyr6Q2HSYP",
    description: "Page title for the free localisation health audit",
  });
  const description = intl.formatMessage({
    defaultMessage:
      "Check your website's technical localisation setup, translation quality, and market fit. See an evidence-led summary before sharing your work email.",
    id: "rqddtYvPV9",
    description: "Meta description for the free localisation health audit",
  });

  return {
    title,
    description,
    alternates: getLocalizedAlternates({
      locale,
      path: "/localisation-audit",
    }),
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default function LocalisationAuditPage() {
  return <LocalisationAuditFlow />;
}
