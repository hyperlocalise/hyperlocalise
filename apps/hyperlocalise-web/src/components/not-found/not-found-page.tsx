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

import { getNotFoundCopy } from "@/components/not-found/not-found-copy";
import { NotFoundRecovery } from "@/components/not-found/not-found-recovery";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";

export async function generateNotFoundMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  const copy = getNotFoundCopy(getIntlShape(locale));

  return {
    title: copy.documentTitle,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export async function NotFoundPage() {
  const locale = await getAppLocale();
  const copy = getNotFoundCopy(getIntlShape(locale));

  return (
    <>
      <title>{copy.documentTitle}</title>
      <NotFoundRecovery
        statusCode={copy.statusCode}
        title={copy.title}
        description={copy.description}
        homeLabel={copy.homeLabel}
        dashboardLabel={copy.dashboardLabel}
        supportLabel={copy.supportLabel}
        homeHref="/"
        dashboardHref="/dashboard"
      />
    </>
  );
}
