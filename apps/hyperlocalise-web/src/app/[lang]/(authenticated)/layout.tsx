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
import type { ReactNode } from "react";

import { BrandThemeProvider } from "@/components/ui/brand-theme";
import { getAuthenticatedLayoutMetadata } from "@/lib/seo/authenticated-page-metadata";

type AuthenticatedLayoutProps = {
  children: ReactNode;
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: AuthenticatedLayoutProps): Promise<Metadata> {
  const { lang } = await params;
  return getAuthenticatedLayoutMetadata(lang);
}

export default function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  return <BrandThemeProvider theme="product">{children}</BrandThemeProvider>;
}
