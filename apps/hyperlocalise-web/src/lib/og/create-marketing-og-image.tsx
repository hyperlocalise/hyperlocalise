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

import { ImageResponse } from "next/og";

export const marketingOgImageSize = { width: 1200, height: 630 } as const;
export const marketingOgImageContentType = "image/png";

const logoPromise = readFile(join(process.cwd(), "public/images/logo.png"));
const domineFontPromise = readFile(
  join(process.cwd(), "public/fonts/domine-latin-700-normal.woff"),
);
const interFontPromise = readFile(join(process.cwd(), "public/fonts/inter-latin-400-normal.ttf"));

type CreateMarketingOgImageOptions = {
  heading: string;
  description: string;
  size?: { width: number; height: number };
};

function headingFontSize(heading: string) {
  if (heading.length > 72) {
    return 40;
  }

  if (heading.length > 48) {
    return 48;
  }

  return 56;
}

export async function createMarketingOgImage({
  heading,
  description,
  size = marketingOgImageSize,
}: CreateMarketingOgImageOptions) {
  const [logo, domineFont, interFont] = await Promise.all([
    logoPromise,
    domineFontPromise,
    interFontPromise,
  ]);

  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        backgroundColor: "#000000",
        padding: "72px 80px",
      }}
    >
      <img
        alt=""
        height={64}
        src={logoSrc}
        style={{
          objectFit: "contain",
        }}
        width={64}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
          marginTop: 40,
          maxWidth: 960,
        }}
      >
        <div
          style={{
            color: "#ffffff",
            fontFamily: "Domine",
            fontSize: headingFontSize(heading),
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
          }}
        >
          {heading}
        </div>
        <div
          style={{
            color: "rgba(255, 255, 255, 0.72)",
            fontFamily: "Inter",
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1.45,
          }}
        >
          {description}
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Domine", data: domineFont, weight: 700, style: "normal" },
        { name: "Inter", data: interFont, weight: 400, style: "normal" },
      ],
    },
  );
}

export function toMarketingOgHeading(title: string) {
  return title.replace(/\s*\|\s*Hyperlocalise\s*$/i, "").trim() || title;
}
