"use client";

import { IntlProvider } from "react-intl";

import { DEFAULT_APP_LOCALE, type AppLocale } from "@/lib/app-i18n/locales";

type I18nProviderProps = {
  locale: AppLocale;
  children: React.ReactNode;
};

export function I18nProvider({ locale, children }: I18nProviderProps) {
  return (
    <IntlProvider locale={locale} defaultLocale={DEFAULT_APP_LOCALE} messages={{}}>
      {children}
    </IntlProvider>
  );
}
