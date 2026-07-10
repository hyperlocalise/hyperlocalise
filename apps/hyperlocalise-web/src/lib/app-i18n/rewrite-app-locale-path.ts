import { DEFAULT_APP_LOCALE, normalizeAppLocale, type AppLocale } from "./locales";

/**
 * Rewrites a pathname (optionally with query/hash) to use `nextLocale` as the
 * `/[lang]` prefix. Preserves query and hash. Same-locale input is returned as-is
 * after normalizing the locale segment casing.
 */
export function rewriteAppLocalePath(href: string, nextLocale: AppLocale): string {
  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;

  const queryIndex = withoutHash.indexOf("?");
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;

  const segments = pathname.split("/");
  const firstSegment = segments[1] ?? "";
  const currentLocale = firstSegment ? normalizeAppLocale(firstSegment) : null;

  let pathnameWithoutLocale: string;
  if (currentLocale) {
    const rest = segments.slice(2).join("/");
    pathnameWithoutLocale = rest ? `/${rest}` : "/";
  } else {
    pathnameWithoutLocale = pathname || "/";
  }

  const normalizedPath =
    pathnameWithoutLocale === "/" ? `/${nextLocale}` : `/${nextLocale}${pathnameWithoutLocale}`;

  return `${normalizedPath}${query}${hash}`;
}

export function getAppLocaleFromPathname(pathname: string): AppLocale {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  if (!firstSegment) {
    return DEFAULT_APP_LOCALE;
  }

  return normalizeAppLocale(firstSegment) ?? DEFAULT_APP_LOCALE;
}

export function getNativeLocaleDisplayName(locale: AppLocale): string {
  try {
    const formatter = new Intl.DisplayNames([locale], { type: "language" });
    return formatter.of(locale) ?? locale;
  } catch {
    return locale;
  }
}

const APP_LOCALE_FLAG_EMOJI = {
  en: "🇺🇸",
  "zh-CN": "🇨🇳",
  "vi-VN": "🇻🇳",
  "de-DE": "🇩🇪",
  "fr-FR": "🇫🇷",
} as const satisfies Record<AppLocale, string>;

export function getAppLocaleFlagEmoji(locale: AppLocale): string {
  return APP_LOCALE_FLAG_EMOJI[locale];
}
