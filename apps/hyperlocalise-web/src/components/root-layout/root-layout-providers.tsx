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
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";

import { I18nProvider } from "@/components/i18n/i18n-provider";
import { QueryProvider } from "@/components/query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DEFAULT_APP_LOCALE, type AppLocale } from "@/lib/app-i18n/locales";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import { withAuth } from "@/lib/workos/server-auth";

import { headingFontForLocale } from "./root-layout-fonts";
import { RootDocumentLocale } from "./root-document-locale";

type RootLayoutProvidersProps = {
  children: ReactNode;
};

type RootLayoutProvidersInnerProps = RootLayoutProvidersProps & {
  initialAuth: React.ComponentProps<typeof AuthKitProvider>["initialAuth"];
  locale: AppLocale;
};

export function RootLayoutProviders({ children }: RootLayoutProvidersProps) {
  return (
    <Suspense
      fallback={
        <RootLayoutProvidersInner initialAuth={undefined} locale={DEFAULT_APP_LOCALE}>
          {children}
        </RootLayoutProvidersInner>
      }
    >
      <RootLayoutProvidersContent>{children}</RootLayoutProvidersContent>
    </Suspense>
  );
}

async function RootLayoutProvidersContent({ children }: RootLayoutProvidersProps) {
  const [locale, initialAuth] = await Promise.all([getAppLocale(), getInitialAuth()]);

  return (
    <RootLayoutProvidersInner initialAuth={initialAuth} locale={locale}>
      {children}
    </RootLayoutProvidersInner>
  );
}

function RootLayoutProvidersInner({
  children,
  initialAuth,
  locale,
}: RootLayoutProvidersInnerProps) {
  const headingFontClassName = headingFontForLocale(locale).variable;

  return (
    <>
      <RootDocumentLocale locale={locale} />
      <div className={headingFontClassName}>
        <AuthKitProvider initialAuth={initialAuth}>
          <I18nProvider locale={locale}>
            <QueryProvider>
              <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
                <TooltipProvider>
                  {children}
                  <Toaster richColors closeButton />
                </TooltipProvider>
              </ThemeProvider>
            </QueryProvider>
          </I18nProvider>
        </AuthKitProvider>
      </div>
    </>
  );
}

async function getInitialAuth(): Promise<
  React.ComponentProps<typeof AuthKitProvider>["initialAuth"]
> {
  const { accessToken: _accessToken, ...initialAuth } = await withAuth();
  return initialAuth;
}
