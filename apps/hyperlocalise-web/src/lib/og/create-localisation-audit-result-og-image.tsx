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

import {
  emailAuditToneColor,
  emailAuditToneFill,
  formatDimensionScore,
  scoreTone,
} from "@/lib/localisation-audit/score-tone";
import type { LocalisationAuditDimensionScores } from "@/lib/localisation-audit/types";

import { marketingOgImageContentType, marketingOgImageSize } from "./create-marketing-og-image";

export { marketingOgImageContentType, marketingOgImageSize };

/** Sage mesh used on the localisation audit landing form. */
const AUDIT_RESULT_OG_MESH_SRC = "images/mesh/mesh-gradient-1784864073608.jpg";

const logoPromise = readFile(join(process.cwd(), "public/images/logo.png"));
const meshPromise = readFile(join(process.cwd(), "public", AUDIT_RESULT_OG_MESH_SRC));
const domineFontPromise = readFile(
  join(process.cwd(), "public/fonts/domine-latin-700-normal.woff"),
);
const interFontPromise = readFile(join(process.cwd(), "public/fonts/inter-latin-400-normal.ttf"));

const DIMENSIONS = [
  { key: "technical", label: "Technical" },
  { key: "linguistic", label: "Linguistic" },
  { key: "contextual", label: "Contextual" },
  { key: "visual", label: "Visual" },
] as const;

type CreateLocalisationAuditResultOgImageOptions = {
  domainKey: string;
  dimensionScores?: LocalisationAuditDimensionScores | null;
  size?: { width: number; height: number };
};

function domainFontSize(domainKey: string) {
  if (domainKey.length > 36) {
    return 40;
  }
  if (domainKey.length > 24) {
    return 48;
  }
  return 56;
}

export async function createLocalisationAuditResultOgImage({
  domainKey,
  dimensionScores = null,
  size = marketingOgImageSize,
}: CreateLocalisationAuditResultOgImageOptions) {
  const [logo, mesh, domineFont, interFont] = await Promise.all([
    logoPromise,
    meshPromise,
    domineFontPromise,
    interFontPromise,
  ]);

  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  const meshSrc = `data:image/jpeg;base64,${mesh.toString("base64")}`;
  const scores = dimensionScores ?? {
    technical: null,
    linguistic: null,
    contextual: null,
    visual: null,
  };

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <img
        alt=""
        height={size.height}
        src={meshSrc}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size.width,
          height: size.height,
          objectFit: "cover",
        }}
        width={size.width}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(180deg, rgba(8, 16, 12, 0.28) 0%, rgba(8, 16, 12, 0.52) 100%)",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <img alt="" height={56} src={logoSrc} style={{ objectFit: "contain" }} width={56} />
          <div
            style={{
              color: "#ffffff",
              fontFamily: "Domine",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Hyperlocalise
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            maxWidth: 980,
          }}
        >
          <div
            style={{
              color: "rgba(255, 255, 255, 0.78)",
              fontFamily: "Inter",
              fontSize: 22,
              fontWeight: 400,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Localisation audit
          </div>
          <div
            style={{
              color: "#ffffff",
              fontFamily: "Domine",
              fontSize: domainFontSize(domainKey),
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            {domainKey}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 28,
          }}
        >
          {DIMENSIONS.map((dimension) => {
            const score = scores[dimension.key];
            const tone = scoreTone(score);
            const color = emailAuditToneColor(tone);
            const fill = emailAuditToneFill(tone);
            return (
              <div
                key={dimension.key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  width: 148,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 88,
                    height: 88,
                    borderRadius: 999,
                    backgroundColor: fill,
                    color,
                    fontFamily: "Domine",
                    fontSize: score == null ? 22 : 30,
                    fontWeight: 700,
                  }}
                >
                  {formatDimensionScore(score)}
                </div>
                <div
                  style={{
                    color: "rgba(255, 255, 255, 0.88)",
                    fontFamily: "Inter",
                    fontSize: 20,
                    fontWeight: 400,
                    textAlign: "center",
                  }}
                >
                  {dimension.label}
                </div>
              </div>
            );
          })}
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
