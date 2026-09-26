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
import type { AppLocale } from "@/lib/app-i18n/locales";
import { appLocaleToBcp47Tag } from "@/lib/seo/bcp47-locale";

type LocaleDocumentLangScriptProps = {
  locale: AppLocale;
};

/**
 * Sets `document.documentElement.lang` from static route params (no request I/O).
 * The root `<html lang>` stays on the default locale so `cacheComponents` can prerender the shell.
 */
export function LocaleDocumentLangScript({ locale }: LocaleDocumentLangScriptProps) {
  const htmlLang = appLocaleToBcp47Tag(locale);

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `document.documentElement.lang=${JSON.stringify(htmlLang)};`,
      }}
    />
  );
}
