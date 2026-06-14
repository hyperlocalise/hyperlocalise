import { createIntl, createIntlCache, type IntlShape } from "@formatjs/intl";

import { DEFAULT_APP_LOCALE, normalizeAppLocale, type AppLocale } from "./locales";

const cache = createIntlCache();

function getMessagesForLocale(_locale: AppLocale): Record<string, string> {
  // Load compiled locale catalogs here when the translation pipeline is wired up.
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
