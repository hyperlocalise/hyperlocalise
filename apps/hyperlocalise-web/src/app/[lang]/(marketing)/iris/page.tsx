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

import { getIrisFaqItems } from "@/components/marketing/iris/iris-faq-content";
import { IrisPage } from "@/components/marketing/iris/iris-page";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { JsonLd } from "@/components/seo/json-ld";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { getLocalizedAlternates, localizedOpenGraph } from "@/lib/seo/localized-alternates";

import { buildIrisJsonLd } from "./build-iris-json-ld";
import { getIrisRouteMetadata } from "./iris-route-metadata";

type IrisRouteProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: IrisRouteProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const intl = getIntlShape(locale);
  const metadata = getIrisRouteMetadata(intl);

  return {
    title: metadata.title,
    description: metadata.description,
    keywords: metadata.keywords,
    alternates: getLocalizedAlternates({ locale, path: "/iris" }),
    openGraph: localizedOpenGraph(locale, "/iris", {
      title: metadata.title,
      description: metadata.description,
      type: "website",
    }),
  };
}

export default async function IrisRoutePage({ params }: IrisRouteProps) {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;

  return (
    <>
      <JsonLd data={buildIrisJsonLd(locale)} />
      <IrisPage faqItems={getIrisFaqItems(locale)} />
      <div className="mx-auto max-w-7xl">
        <section className="border-t border-border">
          <div className="px-5 pt-20 sm:px-8 sm:pt-24 lg:px-10">
            <MarketingFooter columns={footerColumns} />
          </div>
        </section>
      </div>
    </>
  );
}
