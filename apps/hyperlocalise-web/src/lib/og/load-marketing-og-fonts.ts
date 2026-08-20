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
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { AppLocale } from "@/lib/app-i18n/locales";

export type MarketingOgFont = {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
};

export type MarketingOgFonts = {
  headingFontFamily: string;
  bodyFontFamily: string;
  fonts: MarketingOgFont[];
};

const fontsDir = join(process.cwd(), "public/fonts");

function readFont(fileName: string) {
  return readFile(join(fontsDir, fileName));
}

/**
 * Satori resolves one face per family name, so each loaded file must embed every
 * glyph we need for that face. These TTFs are Google Fonts downloads with Latin,
 * Latin-ext, and Vietnamese (or CJK) coverage baked in — matching the locale
 * heading faces chosen in `src/app/layout.tsx`.
 */
const interFontPromise = readFont("inter-400-vietnamese-complete.ttf").then(
  (data): MarketingOgFont => ({
    name: "Inter",
    data,
    weight: 400,
    style: "normal",
  }),
);

const domineFontPromise = readFont("domine-700-latin-ext-complete.ttf").then(
  (data): MarketingOgFont => ({
    name: "Domine",
    data,
    weight: 700,
    style: "normal",
  }),
);

const notoSerifFontPromise = readFont("noto-serif-700-vietnamese-complete.ttf").then(
  (data): MarketingOgFont => ({
    name: "Noto Serif",
    data,
    weight: 700,
    style: "normal",
  }),
);

const notoSerifScFontPromise = readFont("noto-serif-sc-chinese-simplified-700-normal.woff").then(
  (data): MarketingOgFont => ({
    name: "Noto Serif SC",
    data,
    weight: 700,
    style: "normal",
  }),
);

/**
 * Load OG fonts for a marketing locale.
 * Mirrors `headingFontForLocale` in `src/app/layout.tsx`: Domine for Latin locales,
 * Noto Serif for Vietnamese, Noto Serif SC for Simplified Chinese.
 */
export async function loadMarketingOgFonts(locale: AppLocale): Promise<MarketingOgFonts> {
  if (locale === "vi-VN") {
    const [headingFont, bodyFont] = await Promise.all([notoSerifFontPromise, interFontPromise]);
    return {
      headingFontFamily: "Noto Serif",
      bodyFontFamily: "Inter",
      fonts: [headingFont, bodyFont],
    };
  }

  if (locale === "zh-CN") {
    const [headingFont, bodyFont] = await Promise.all([notoSerifScFontPromise, interFontPromise]);
    return {
      headingFontFamily: "Noto Serif SC",
      bodyFontFamily: "Noto Serif SC, Inter",
      fonts: [headingFont, bodyFont],
    };
  }

  const [headingFont, bodyFont] = await Promise.all([domineFontPromise, interFontPromise]);
  return {
    headingFontFamily: "Domine",
    bodyFontFamily: "Inter",
    fonts: [headingFont, bodyFont],
  };
}
