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
 * Satori resolves one face per family name + weight, so each loaded file must
 * embed every glyph we need for that face. These TTFs are Google Fonts downloads
 * with Latin, Latin-ext, and Vietnamese coverage baked in.
 *
 * Inter has no CJK glyphs. Simplified Chinese OG images keep Noto Serif SC as a
 * coverage face so Satori does not tofu.
 */
const interRegularFontPromise = readFont("inter-400-vietnamese-complete.ttf").then(
  (data): MarketingOgFont => ({
    name: "Inter",
    data,
    weight: 400,
    style: "normal",
  }),
);

const interBoldFontPromise = readFont("inter-700-vietnamese-complete.ttf").then(
  (data): MarketingOgFont => ({
    name: "Inter",
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
 * Inter Bold for headings and Inter Regular for body. zh-CN still loads
 * Noto Serif SC so CJK glyphs render in Satori.
 */
export async function loadMarketingOgFonts(locale: AppLocale): Promise<MarketingOgFonts> {
  const [headingFont, bodyFont] = await Promise.all([
    interBoldFontPromise,
    interRegularFontPromise,
  ]);

  if (locale === "zh-CN") {
    const cjkFont = await notoSerifScFontPromise;
    return {
      headingFontFamily: "Noto Serif SC",
      bodyFontFamily: "Noto Serif SC, Inter",
      fonts: [cjkFont, headingFont, bodyFont],
    };
  }

  return {
    headingFontFamily: "Inter",
    bodyFontFamily: "Inter",
    fonts: [headingFont, bodyFont],
  };
}
