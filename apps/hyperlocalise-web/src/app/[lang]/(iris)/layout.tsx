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
import type { Metadata } from "next";
import { Bodoni_Moda } from "next/font/google";
import type { ReactNode } from "react";

import { JsonLd } from "@/components/seo/json-ld";
import { buildOrganizationJsonLd } from "@/components/seo/organization-json-ld";
import { SUPPORTED_APP_LOCALES } from "@/lib/app-i18n/locales";
import { INDEXABLE_ROBOTS } from "@/lib/seo/robots-metadata";

const irisDisplay = Bodoni_Moda({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--font-iris-display",
  display: "swap",
});

export const metadata: Metadata = {
  robots: INDEXABLE_ROBOTS,
};

export function generateStaticParams() {
  return SUPPORTED_APP_LOCALES.map((lang) => ({ lang }));
}

type IrisLayoutProps = {
  children: ReactNode;
};

export default function IrisLayout({ children }: IrisLayoutProps) {
  const organizationJsonLd = buildOrganizationJsonLd();

  return (
    <div className={irisDisplay.variable}>
      <JsonLd data={organizationJsonLd} />
      {children}
    </div>
  );
}
