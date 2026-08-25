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

import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";

import { createLegalMetadata, LegalPage } from "../_components/legal-page";
import { CloudServiceAgreement } from "./cloud-service-agreement";

type TermsPageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: TermsPageProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;

  return createLegalMetadata({
    title: "Terms of service",
    description:
      "Cloud Service Agreement terms that govern use of Hyperlocalise websites, docs, and services.",
    locale,
    path: "/terms",
  });
}

export default async function TermsPage({ params }: TermsPageProps) {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;

  return (
    <LegalPage
      locale={locale}
      eyebrow="Legal"
      title="Terms of service"
      description="Cloud Service Agreement terms for Hyperlocalise Pty Ltd, adapted from Common Paper CSA Version 2.1."
    >
      <CloudServiceAgreement locale={locale} />
    </LegalPage>
  );
}
