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
import { GoogleAnalytics } from "@next/third-parties/google";
import type { ReactNode } from "react";

import { GA_MEASUREMENT_ID } from "@/lib/analytics/google-analytics";
import { getAppLocale } from "@/lib/app-i18n/server-locale";

import { rootHtmlClassName } from "./root-layout-fonts";
import { RootLayoutProviders } from "./root-layout-providers";

type RootHtmlProps = {
  children: ReactNode;
};

export async function RootHtml({ children }: RootHtmlProps) {
  const locale = await getAppLocale();

  return (
    <html lang={locale} className={rootHtmlClassName()} suppressHydrationWarning>
      <body>
        <Analytics />
        <RootLayoutProviders locale={locale}>{children}</RootLayoutProviders>
      </body>

      <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
    </html>
  );
}
