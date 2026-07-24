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
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Domine, Geist_Mono, Inter, Noto_Serif, Noto_Serif_SC } from "next/font/google";
import { withAuth } from "@/lib/workos/server-auth";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import { QueryProvider } from "@/components/query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import type { AppLocale } from "@/lib/app-i18n/locales";
import { SITE_URL } from "@/lib/seo/site-url";
import { GoogleAnalytics } from "@next/third-parties/google";
import { cn } from "@/lib/primitives/cn";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-sans",
});

/** Domine only ships latin + latin-ext (covers en / de-DE / fr-FR). */
const domine = Domine({
  subsets: ["latin", "latin-ext"],
  variable: "--font-heading",
});

/** Fallback heading face when Domine lacks Vietnamese glyphs. */
const notoSerif = Noto_Serif({
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-heading",
});

/** Fallback heading face when Domine lacks CJK glyphs. */
const notoSerifSc = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  preload: false,
  variable: "--font-heading",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function headingFontForLocale(locale: AppLocale) {
  if (locale === "vi-VN") {
    return notoSerif;
  }
  if (locale === "zh-CN") {
    return notoSerifSc;
  }
  return domine;
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Hyperlocalise | The Best Agentic Localisation Platform",
  description:
    "Hyperlocalise is an AI workforce that helps teams launch globally in days — with market nuance, translation, and first-class human review.",
};

async function getInitialAuth(): Promise<
  React.ComponentProps<typeof AuthKitProvider>["initialAuth"]
> {
  const { accessToken: _accessToken, ...initialAuth } = await withAuth();
  return initialAuth;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, initialAuth] = await Promise.all([getAppLocale(), getInitialAuth()]);
  const headingFont = headingFontForLocale(locale);

  return (
    <html
      lang={locale}
      className={cn(
        "antialiased",
        "font-sans",
        geistMono.variable,
        inter.variable,
        headingFont.variable,
      )}
      suppressHydrationWarning
    >
      <body>
        <Analytics />
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
      </body>

      <GoogleAnalytics gaId="G-ET30XL0TE6" />
    </html>
  );
}
