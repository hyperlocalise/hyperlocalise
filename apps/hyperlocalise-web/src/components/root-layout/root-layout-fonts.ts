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
import { Domine, Geist_Mono, Inter, Noto_Serif, Noto_Serif_SC } from "next/font/google";

import { DEFAULT_APP_LOCALE, type AppLocale } from "@/lib/app-i18n/locales";
import { cn } from "@/lib/primitives/cn";

export const inter = Inter({
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-sans",
});

/** Domine only ships latin + latin-ext (covers en / de-DE / fr-FR). */
export const domine = Domine({
  subsets: ["latin", "latin-ext"],
  variable: "--font-heading-marketing",
});

/** Fallback heading face when Domine lacks Vietnamese glyphs. */
export const notoSerif = Noto_Serif({
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-heading-marketing",
});

/** Fallback heading face when Domine lacks CJK glyphs. */
export const notoSerifSc = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  preload: false,
  variable: "--font-heading-marketing",
});

export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function headingFontForLocale(locale: AppLocale) {
  if (locale === "vi-VN") {
    return notoSerif;
  }
  if (locale === "zh-CN") {
    return notoSerifSc;
  }
  return domine;
}

export function rootHtmlClassName(locale: AppLocale = DEFAULT_APP_LOCALE) {
  const headingFont = headingFontForLocale(locale);

  return cn("antialiased", "font-sans", geistMono.variable, inter.variable, headingFont.variable);
}
