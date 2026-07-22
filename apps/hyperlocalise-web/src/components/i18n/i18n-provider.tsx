"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useMemo } from "react";
import { IntlProvider } from "react-intl";

import { getIntlShape } from "@/lib/app-i18n/intl";
import { DEFAULT_APP_LOCALE, type AppLocale } from "@/lib/app-i18n/locales";

type I18nProviderProps = {
  locale: AppLocale;
  children: React.ReactNode;
};

export function I18nProvider({ locale, children }: I18nProviderProps) {
  const intl = useMemo(() => getIntlShape(locale), [locale]);

  return (
    <IntlProvider locale={locale} defaultLocale={DEFAULT_APP_LOCALE} messages={intl.messages}>
      {children}
    </IntlProvider>
  );
}
