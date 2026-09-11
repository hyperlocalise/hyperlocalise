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

import { JsonLd } from "@/components/seo/json-ld";
import { buildOrganizationJsonLd } from "@/components/seo/organization-json-ld";
import { BrandThemeProvider } from "@/components/ui/brand-theme";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { INDEXABLE_ROBOTS } from "@/lib/seo/robots-metadata";

import Navbar from "./_components/navbar";

export const metadata: Metadata = {
  robots: INDEXABLE_ROBOTS,
};

type MarketingLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
};

export default async function MarketingLayout({ children, params }: MarketingLayoutProps) {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const organizationJsonLd = buildOrganizationJsonLd(locale);

  return (
    <BrandThemeProvider theme="marketing">
      <JsonLd data={organizationJsonLd} />
      <Navbar />
      <main>{children}</main>
    </BrandThemeProvider>
  );
}
