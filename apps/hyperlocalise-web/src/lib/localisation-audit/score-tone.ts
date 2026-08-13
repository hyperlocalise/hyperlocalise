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
import type { LocalisationAuditFindingSeverity } from "./types";

/** Semantic tones shared by the public report page and the report email. */
export type LocalisationAuditTone = "safe" | "watch" | "risk" | "info" | "neutral";

export function scoreTone(score: number | null | undefined): LocalisationAuditTone {
  if (score == null) return "neutral";
  if (score >= 75) return "safe";
  if (score >= 50) return "watch";
  return "risk";
}

export function formatDimensionScore(score: number | null | undefined): string {
  return score == null ? "N/A" : String(score);
}

export function severityTone(severity: LocalisationAuditFindingSeverity): LocalisationAuditTone {
  switch (severity) {
    case "critical":
    case "high":
      return "risk";
    case "warning":
    case "medium":
      return "watch";
    case "low":
      return "info";
    default:
      return "neutral";
  }
}

/** Light-theme hex values for HTML email (no CSS variables). */
export function emailAuditToneColor(tone: LocalisationAuditTone): string {
  switch (tone) {
    case "safe":
      return "#107d32";
    case "watch":
      return "#aa4d00";
    case "risk":
      return "#ea001d";
    case "info":
      return "#0059ec";
    default:
      return "#6b7280";
  }
}

export function emailAuditToneFill(tone: LocalisationAuditTone): string {
  switch (tone) {
    case "safe":
      return "#ecfdec";
    case "watch":
      return "#fff6de";
    case "risk":
      return "#ffeeef";
    case "info":
      return "#f0f7ff";
    default:
      return "#f3f4f6";
  }
}
