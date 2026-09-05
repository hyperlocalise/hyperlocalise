"use client";

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
import { usePathname } from "next/navigation";
import { Suspense, useLayoutEffect } from "react";

import { normalizeAppLocale, type AppLocale } from "@/lib/app-i18n/locales";

type RootDocumentLocaleProps = {
  locale: AppLocale;
};

export function RootDocumentLocale({ locale }: RootDocumentLocaleProps) {
  return (
    <Suspense fallback={null}>
      <RootDocumentLocaleInner locale={locale} />
    </Suspense>
  );
}

function RootDocumentLocaleInner({ locale }: RootDocumentLocaleProps) {
  const pathname = usePathname();
  const pathLocale = normalizeAppLocale(pathname.split("/").filter(Boolean)[0] ?? "");
  const documentLocale = pathLocale ?? locale;

  useLayoutEffect(() => {
    document.documentElement.lang = documentLocale;
  }, [documentLocale]);

  return null;
}
