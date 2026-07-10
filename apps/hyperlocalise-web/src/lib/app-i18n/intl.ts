import { createIntl, createIntlCache, type IntlShape } from "@formatjs/intl";

import deDEMessages from "../../../lang/de-DE.json";
import frFRMessages from "../../../lang/fr-FR.json";
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
  "vi-VN": toMessages(viVNMessages as LocaleCatalog),
  "de-DE": toMessages(deDEMessages as LocaleCatalog),
  "fr-FR": toMessages(frFRMessages as LocaleCatalog),
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
