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
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";

import { JsonLd } from "@/components/seo/json-ld";
import { buildOrganizationJsonLd } from "@/components/seo/organization-json-ld";
import { BrandThemeProvider } from "@/components/ui/brand-theme";
import { INDEXABLE_ROBOTS } from "@/lib/seo/robots-metadata";

import Navbar from "./_components/navbar";

export const metadata: Metadata = {
  robots: INDEXABLE_ROBOTS,
};

type MarketingLayoutProps = {
  children: React.ReactNode;
};

export default async function MarketingLayout({ children }: MarketingLayoutProps) {
  const organizationJsonLd = buildOrganizationJsonLd();

  // No initialAuth: the session loads on the client so marketing pages stay prerendered.
  return (
    <AuthKitProvider>
      <BrandThemeProvider theme="marketing">
        <JsonLd data={organizationJsonLd} />
        <Navbar />
        <main>{children}</main>
      </BrandThemeProvider>
    </AuthKitProvider>
  );
}
