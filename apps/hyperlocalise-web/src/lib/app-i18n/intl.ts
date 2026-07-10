import { createIntl, createIntlCache, type IntlShape } from "@formatjs/intl";

import viVNMessages from "../../../lang/vi-VN.json";
import zhCNMessages from "../../../lang/zh-CN.json";

import { DEFAULT_APP_LOCALE, normalizeAppLocale, type AppLocale } from "./locales";

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

const translatedCatalogs = {
  "zh-CN": toMessages(zhCNMessages as LocaleCatalog),
  "vi-VN": toMessages(viVNMessages as LocaleCatalog),
} as const;

function getMessagesForLocale(locale: AppLocale): Record<string, string> {
  // Source locale uses defaultMessage from descriptors; no en-US catalog needed.
  if (locale === DEFAULT_APP_LOCALE) {
    return {};
  }

  if (locale in translatedCatalogs) {
    return translatedCatalogs[locale as keyof typeof translatedCatalogs];
  }

  return {};
}

export function getIntlShape(locale: string = DEFAULT_APP_LOCALE): IntlShape {
  const normalizedLocale = normalizeAppLocale(locale) ?? DEFAULT_APP_LOCALE;

  return createIntl(
    {
      locale: normalizedLocale,
      messages: getMessagesForLocale(normalizedLocale),
    },
    cache,
  );
}
