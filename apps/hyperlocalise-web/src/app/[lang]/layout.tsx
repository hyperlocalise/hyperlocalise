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
import type { ReactNode } from "react";

import { isSupportedAppLocale, normalizeAppLocale } from "@/lib/app-i18n/locales";

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ lang: string }>;
};

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { lang } = await params;

  if (!isSupportedAppLocale(lang)) {
    notFound();
  }

  if (!normalizeAppLocale(lang)) {
    notFound();
  }

<<<<<<< HEAD
  return children;
=======
  return (
    <>
      <LocaleDocumentLangScript locale={locale} />
      {children}
    </>
  );
>>>>>>> origin/main
}
