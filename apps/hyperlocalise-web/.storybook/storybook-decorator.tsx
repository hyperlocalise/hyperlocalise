"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

import { I18nProvider } from "../src/components/i18n/i18n-provider";
import {
  DEFAULT_APP_LOCALE,
  isSupportedAppLocale,
  type AppLocale,
} from "../src/lib/app-i18n/locales";
import { isRtlLocale } from "../src/lib/i18n/locales";

export type StorybookTheme = "light" | "dark" | "system";

type StorybookDecoratorProps = {
  locale: string;
  theme: StorybookTheme;
  children: React.ReactNode;
};

function ThemeSync({ theme, children }: { theme: StorybookTheme; children: React.ReactNode }) {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme(theme);
  }, [setTheme, theme]);

  return children;
}

function resolveLocale(locale: string): AppLocale {
  return isSupportedAppLocale(locale) ? locale : DEFAULT_APP_LOCALE;
}

export function StorybookDecorator({ locale, theme, children }: StorybookDecoratorProps) {
  const resolvedLocale = resolveLocale(locale);

  useEffect(() => {
    document.documentElement.lang = resolvedLocale;
    document.documentElement.dir = isRtlLocale(resolvedLocale) ? "rtl" : "ltr";
  }, [resolvedLocale]);

  return (
    <I18nProvider locale={resolvedLocale}>
      <ThemeSync theme={theme}>{children}</ThemeSync>
    </I18nProvider>
  );
}
