"use client";

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
