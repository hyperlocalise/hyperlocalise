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
import { createIntl, createIntlCache, type IntlShape } from "@formatjs/intl";

import daDKMessages from "../../../lang/da-DK.json";
import deDEMessages from "../../../lang/de-DE.json";
import filPHMessages from "../../../lang/fil-PH.json";
import frFRMessages from "../../../lang/fr-FR.json";
import jaJPMessages from "../../../lang/ja-JP.json";
import koKRMessages from "../../../lang/ko-KR.json";
import nlNLMessages from "../../../lang/nl-NL.json";
import thTHMessages from "../../../lang/th-TH.json";
import viVNMessages from "../../../lang/vi-VN.json";
import zhCNMessages from "../../../lang/zh-CN.json";

import {
  DEFAULT_APP_LOCALE,
  normalizeAppContentLocale,
  normalizeAppLocale,
  type AppContentLocale,
} from "./locales";

const cache = createIntlCache();

type SourceCatalogEntry = {
  defaultMessage: string;
  description?: string;
};

type LocaleCatalog = Record<string, string | SourceCatalogEntry>;

function toMessages(catalog: LocaleCatalog): Record<string, string> {
  const messages: Record<string, string> = {};

  for (const [id, value] of Object.entries(catalog)) {
    messages[id] = typeof value === "string" ? value : value.defaultMessage;
  }

  return messages;
}

const translatedCatalogs: Partial<Record<AppContentLocale, Record<string, string>>> = {
  "zh-CN": toMessages(zhCNMessages as LocaleCatalog),
  "da-DK": toMessages(daDKMessages as LocaleCatalog),
  "nl-NL": toMessages(nlNLMessages as LocaleCatalog),
  "fil-PH": toMessages(filPHMessages as LocaleCatalog),
  "fr-FR": toMessages(frFRMessages as LocaleCatalog),
  "de-DE": toMessages(deDEMessages as LocaleCatalog),
  "ja-JP": toMessages(jaJPMessages as LocaleCatalog),
  "ko-KR": toMessages(koKRMessages as LocaleCatalog),
  "th-TH": toMessages(thTHMessages as LocaleCatalog),
  "vi-VN": toMessages(viVNMessages as LocaleCatalog),
};

function getMessagesForLocale(locale: AppContentLocale): Record<string, string> {
  // Source locale uses defaultMessage from descriptors; no en-US catalog needed.
  if (locale === DEFAULT_APP_LOCALE) {
    return {};
  }

  return translatedCatalogs[locale] ?? {};
}

export function getIntlShape(locale: string = DEFAULT_APP_LOCALE): IntlShape {
  const normalizedLocale =
    normalizeAppLocale(locale) ?? normalizeAppContentLocale(locale) ?? DEFAULT_APP_LOCALE;

  return createIntl(
    {
      locale: normalizedLocale,
      messages: getMessagesForLocale(normalizedLocale),
    },
    cache,
  );
}
