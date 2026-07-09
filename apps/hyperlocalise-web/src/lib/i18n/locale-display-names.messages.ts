"use client";

import { defineMessages, type MessageDescriptor } from "react-intl";

import { COMMON_LOCALES, canonicalizeLocale, getLocaleLabel, type CommonLocale } from "./locales";

function localeMessageKey(locale: CommonLocale): string {
  return locale.replaceAll("-", "_");
}

export const commonLocaleDisplayNameMessages = defineMessages({
  en: {
    defaultMessage: "English",
    id: "8qtlRUPEdv",
    description: "Display name for BCP-47 locale en",
  },
  en_US: {
    defaultMessage: "English (United States)",
    id: "9yja2gkowg",
    description: "Display name for BCP-47 locale en-US",
  },
  en_GB: {
    defaultMessage: "English (United Kingdom)",
    id: "tVauVnOkcX",
    description: "Display name for BCP-47 locale en-GB",
  },
  en_AU: {
    defaultMessage: "English (Australia)",
    id: "NqAGQvs7qB",
    description: "Display name for BCP-47 locale en-AU",
  },
  en_IN: {
    defaultMessage: "English (India)",
    id: "XQOIgvLSGN",
    description: "Display name for BCP-47 locale en-IN",
  },
  es_ES: {
    defaultMessage: "Spanish (Spain)",
    id: "BUUxfUaq94",
    description: "Display name for BCP-47 locale es-ES",
  },
  es_MX: {
    defaultMessage: "Spanish (Mexico)",
    id: "cdYuP66GRZ",
    description: "Display name for BCP-47 locale es-MX",
  },
  fr_FR: {
    defaultMessage: "French (France)",
    id: "DJGr6J4yAS",
    description: "Display name for BCP-47 locale fr-FR",
  },
  fr_CA: {
    defaultMessage: "French (Canada)",
    id: "ZxL7hC2wPP",
    description: "Display name for BCP-47 locale fr-CA",
  },
  de_DE: {
    defaultMessage: "German (Germany)",
    id: "9WGORyVfVo",
    description: "Display name for BCP-47 locale de-DE",
  },
  it_IT: {
    defaultMessage: "Italian (Italy)",
    id: "yIwRFz93s7",
    description: "Display name for BCP-47 locale it-IT",
  },
  pt_BR: {
    defaultMessage: "Portuguese (Brazil)",
    id: "0MjCwM2JVC",
    description: "Display name for BCP-47 locale pt-BR",
  },
  pt_PT: {
    defaultMessage: "Portuguese (Portugal)",
    id: "oCbdMbr62i",
    description: "Display name for BCP-47 locale pt-PT",
  },
  nl_NL: {
    defaultMessage: "Dutch (Netherlands)",
    id: "0KX3L72Boe",
    description: "Display name for BCP-47 locale nl-NL",
  },
  sv_SE: {
    defaultMessage: "Swedish (Sweden)",
    id: "dCGRsZA2Gq",
    description: "Display name for BCP-47 locale sv-SE",
  },
  da_DK: {
    defaultMessage: "Danish (Denmark)",
    id: "IRhB9WkxFD",
    description: "Display name for BCP-47 locale da-DK",
  },
  nb_NO: {
    defaultMessage: "Norwegian Bokmål (Norway)",
    id: "2Gq43ufxii",
    description: "Display name for BCP-47 locale nb-NO",
  },
  fi_FI: {
    defaultMessage: "Finnish (Finland)",
    id: "FRwUYE4HKC",
    description: "Display name for BCP-47 locale fi-FI",
  },
  pl_PL: {
    defaultMessage: "Polish (Poland)",
    id: "qtTx0ZhgLU",
    description: "Display name for BCP-47 locale pl-PL",
  },
  cs_CZ: {
    defaultMessage: "Czech (Czechia)",
    id: "qyAeUOVpZe",
    description: "Display name for BCP-47 locale cs-CZ",
  },
  hu_HU: {
    defaultMessage: "Hungarian (Hungary)",
    id: "ngHznLyUeM",
    description: "Display name for BCP-47 locale hu-HU",
  },
  ro_RO: {
    defaultMessage: "Romanian (Romania)",
    id: "NrJMjFZDfb",
    description: "Display name for BCP-47 locale ro-RO",
  },
  tr_TR: {
    defaultMessage: "Turkish (Türkiye)",
    id: "PSqr8lzpHo",
    description: "Display name for BCP-47 locale tr-TR",
  },
  el_GR: {
    defaultMessage: "Greek (Greece)",
    id: "tuvZlDHxtM",
    description: "Display name for BCP-47 locale el-GR",
  },
  ru_RU: {
    defaultMessage: "Russian (Russia)",
    id: "r6Ldwc5qHk",
    description: "Display name for BCP-47 locale ru-RU",
  },
  uk_UA: {
    defaultMessage: "Ukrainian (Ukraine)",
    id: "ddPY0So4Vu",
    description: "Display name for BCP-47 locale uk-UA",
  },
  ar_SA: {
    defaultMessage: "Arabic (Saudi Arabia)",
    id: "5cCuwKVimM",
    description: "Display name for BCP-47 locale ar-SA",
  },
  he_IL: {
    defaultMessage: "Hebrew (Israel)",
    id: "iUgXrXTD7Q",
    description: "Display name for BCP-47 locale he-IL",
  },
  fa_IR: {
    defaultMessage: "Persian (Iran)",
    id: "HmztzT6qT0",
    description: "Display name for BCP-47 locale fa-IR",
  },
  hi_IN: {
    defaultMessage: "Hindi (India)",
    id: "8QnsMQk5Mf",
    description: "Display name for BCP-47 locale hi-IN",
  },
  bn_BD: {
    defaultMessage: "Bangla (Bangladesh)",
    id: "qABPUMMqNa",
    description: "Display name for BCP-47 locale bn-BD",
  },
  id_ID: {
    defaultMessage: "Indonesian (Indonesia)",
    id: "OMX8Bbcvwm",
    description: "Display name for BCP-47 locale id-ID",
  },
  ms_MY: {
    defaultMessage: "Malay (Malaysia)",
    id: "a5JQ0J1lXL",
    description: "Display name for BCP-47 locale ms-MY",
  },
  vi_VN: {
    defaultMessage: "Vietnamese (Vietnam)",
    id: "WPbNdWbmRX",
    description: "Display name for BCP-47 locale vi-VN",
  },
  th_TH: {
    defaultMessage: "Thai (Thailand)",
    id: "o0UaTUXfqZ",
    description: "Display name for BCP-47 locale th-TH",
  },
  fil_PH: {
    defaultMessage: "Filipino (Philippines)",
    id: "1iajv5nbml",
    description: "Display name for BCP-47 locale fil-PH",
  },
  ja_JP: {
    defaultMessage: "Japanese (Japan)",
    id: "GZgOkkX0hj",
    description: "Display name for BCP-47 locale ja-JP",
  },
  ko_KR: {
    defaultMessage: "Korean (South Korea)",
    id: "9YNv5fx63k",
    description: "Display name for BCP-47 locale ko-KR",
  },
  zh_CN: {
    defaultMessage: "Chinese (China)",
    id: "wvaLTvlaJ6",
    description: "Display name for BCP-47 locale zh-CN",
  },
  zh_TW: {
    defaultMessage: "Chinese (Taiwan)",
    id: "8n5eYbhjGv",
    description: "Display name for BCP-47 locale zh-TW",
  },
  zh_HK: {
    defaultMessage: "Chinese (Hong Kong SAR China)",
    id: "x9TtAEs9eF",
    description: "Display name for BCP-47 locale zh-HK",
  },
});

const commonLocaleMessageByCode = Object.fromEntries(
  COMMON_LOCALES.map((locale) => [
    locale,
    commonLocaleDisplayNameMessages[
      localeMessageKey(locale) as keyof typeof commonLocaleDisplayNameMessages
    ],
  ]),
) as Record<CommonLocale, MessageDescriptor>;

export function getCommonLocaleDisplayNameMessage(locale: string): MessageDescriptor | undefined {
  const canonical = canonicalizeLocale(locale) ?? locale;
  return commonLocaleMessageByCode[canonical as CommonLocale];
}

/** Localised display name for a BCP-47 tag; falls back to Intl.DisplayNames for unknown tags. */
export function formatLocaleDisplayName(
  intl: { formatMessage: (descriptor: MessageDescriptor) => string },
  locale: string,
): string {
  const message = getCommonLocaleDisplayNameMessage(locale);
  if (message) {
    return intl.formatMessage(message);
  }
  return getLocaleLabel(locale);
}

/** Display name with locale code, e.g. "French (France) (fr-FR)". */
export function formatLocaleOptionLabel(
  intl: { formatMessage: (descriptor: MessageDescriptor) => string },
  locale: string,
): string {
  return `${formatLocaleDisplayName(intl, locale)} (${canonicalizeLocale(locale) ?? locale})`;
}
