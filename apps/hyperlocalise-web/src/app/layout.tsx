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
import { GoogleAnalytics } from "@next/third-parties/google";

import { RootLayoutProviders } from "@/components/root-layout/root-layout-providers";
import { rootHtmlClassName } from "@/components/root-layout/root-layout-fonts";
import { GA_MEASUREMENT_ID } from "@/lib/analytics/google-analytics";
import { DEFAULT_APP_LOCALE } from "@/lib/app-i18n/locales";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-metadata";
import { SITE_URL } from "@/lib/seo/site-url";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Hyperlocalise | The Best Agentic Localisation Platform",
  description:
    "Hyperlocalise is an AI workforce that helps teams launch globally in days — with market nuance, translation, and first-class human review.",
  robots: PRIVATE_ROBOTS,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={DEFAULT_APP_LOCALE} className={rootHtmlClassName()} suppressHydrationWarning>
      <body>
        <Analytics />
        <RootLayoutProviders>{children}</RootLayoutProviders>
      </body>

      <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
    </html>
  );
}
