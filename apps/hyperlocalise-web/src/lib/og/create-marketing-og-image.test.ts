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
import { describe, expect, it } from "vite-plus/test";

import { createMarketingOgImage } from "./create-marketing-og-image";
import { loadMarketingOgFonts } from "./load-marketing-og-fonts";

describe("loadMarketingOgFonts", () => {
  it("uses Noto Serif + Inter for Vietnamese", async () => {
    const fonts = await loadMarketingOgFonts("vi-VN");
    expect(fonts.headingFontFamily).toBe("Noto Serif");
    expect(fonts.bodyFontFamily).toBe("Inter");
    expect(fonts.fonts.map((font) => font.name)).toEqual(["Noto Serif", "Inter"]);
  });

  it("uses Noto Serif SC for Simplified Chinese", async () => {
    const fonts = await loadMarketingOgFonts("zh-CN");
    expect(fonts.headingFontFamily).toBe("Noto Serif SC");
    expect(fonts.bodyFontFamily).toContain("Noto Serif SC");
    expect(fonts.fonts.some((font) => font.name === "Noto Serif SC")).toBe(true);
  });

  it("uses Domine + Inter for Latin locales", async () => {
    for (const locale of ["en", "de-DE", "fr-FR"] as const) {
      const fonts = await loadMarketingOgFonts(locale);
      expect(fonts.headingFontFamily).toBe("Domine");
      expect(fonts.bodyFontFamily).toBe("Inter");
      expect(fonts.fonts.map((font) => font.name)).toEqual(["Domine", "Inter"]);
    }
  });
});

describe("createMarketingOgImage", () => {
  it("renders a PNG for English copy", async () => {
    const response = await createMarketingOgImage({
      heading: "What is a website localisation audit?",
      description: "Translating a website is only the first step.",
      locale: "en",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("image/png");
    const bytes = await response.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });

  it("renders Vietnamese copy without throwing (Noto Serif + Inter vietnamese)", async () => {
    const response = await createMarketingOgImage({
      heading: "Kiểm tra bản địa hóa website là gì?",
      description:
        "Dịch một website chỉ là bước khởi đầu. Một cuộc kiểm tra bản địa hóa đánh giá việc triển khai kỹ thuật, chất lượng ngôn ngữ, bối cảnh sản phẩm và trải nghiệm trực quan.",
      locale: "vi-VN",
    });

    expect(response.status).toBe(200);
    const bytes = await response.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });

  it("renders Simplified Chinese copy without throwing", async () => {
    const response = await createMarketingOgImage({
      heading: "什么是网站本地化审计？",
      description: "翻译网站只是第一步。本地化审计评估技术实现、语言质量、产品语境与视觉体验。",
      locale: "zh-CN",
    });

    expect(response.status).toBe(200);
    const bytes = await response.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });
});
