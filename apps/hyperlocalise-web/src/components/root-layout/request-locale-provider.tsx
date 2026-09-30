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
import { Suspense, type ReactNode } from "react";

import { I18nProvider } from "@/components/i18n/i18n-provider";
import { getAppLocale } from "@/lib/app-i18n/server-locale";

import { RootDocumentLocale } from "./root-document-locale";

type RequestLocaleProviderProps = {
  children: ReactNode;
};

/**
 * Locale from proxy headers and cookies, for routes outside `/[lang]`.
 * Routes under `/[lang]` take the locale from params instead.
 */
export function RequestLocaleProvider({ children }: RequestLocaleProviderProps) {
  return (
    <Suspense fallback={null}>
      <RequestLocaleProviderContent>{children}</RequestLocaleProviderContent>
    </Suspense>
  );
}

async function RequestLocaleProviderContent({ children }: RequestLocaleProviderProps) {
  const locale = await getAppLocale();

  return (
    <>
      <RootDocumentLocale locale={locale} />
      <I18nProvider locale={locale}>{children}</I18nProvider>
    </>
  );
}
