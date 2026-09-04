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
import { notFound } from "next/navigation";

import { IntegrationDetailPage } from "@/components/marketing/integrations/integration-detail-page";
import {
  getMarketingIntegrationBySlug,
  integrationSlugs,
} from "@/components/marketing/integrations/integrations-page-content";
import { getIntlShape } from "@/lib/app-i18n/intl";
import {
  DEFAULT_APP_LOCALE,
  normalizeAppLocale,
  SUPPORTED_APP_LOCALES,
} from "@/lib/app-i18n/locales";
import { getLocalizedAlternates } from "@/lib/seo/localized-alternates";

import { getIntegrationRouteMetadata } from "./integration-route-metadata";

type IntegrationRouteParams = {
  lang: string;
  slug: string;
};

type IntegrationRouteProps = {
  params: Promise<IntegrationRouteParams>;
};

export function generateStaticParams() {
  return SUPPORTED_APP_LOCALES.flatMap((lang) => integrationSlugs.map((slug) => ({ lang, slug })));
}

export async function generateMetadata({ params }: IntegrationRouteProps): Promise<Metadata> {
  const { lang, slug } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const intl = getIntlShape(locale);
  const metadata = getIntegrationRouteMetadata(intl, slug);

  if (!metadata) {
    return {};
  }

  const { title, description, keywords } = metadata;

  return {
    title,
    description,
    keywords,
    alternates: getLocalizedAlternates({ locale, path: `/integrations/${slug}` }),
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default async function IntegrationRoutePage({ params }: IntegrationRouteProps) {
  const { lang, slug } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const integration = getMarketingIntegrationBySlug(locale, slug);

  if (!integration) {
    notFound();
  }

  return <IntegrationDetailPage integration={integration} />;
}
