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
import { notFound } from "next/navigation";

import { I18nProvider } from "@/components/i18n/i18n-provider";
import { LocaleDocumentLangScript } from "@/components/root-layout/locale-document-lang-script";
import { RootDocumentLocale } from "@/components/root-layout/root-document-locale";
import { SUPPORTED_APP_LOCALES, normalizeAppLocale } from "@/lib/app-i18n/locales";

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
};

export function generateStaticParams() {
  return SUPPORTED_APP_LOCALES.map((lang) => ({ lang }));
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang);

  if (!locale) {
    notFound();
  }

  return (
    <>
      <LocaleDocumentLangScript locale={locale} />
      <RootDocumentLocale locale={locale} />
      <I18nProvider locale={locale}>{children}</I18nProvider>
    </>
  );
}
