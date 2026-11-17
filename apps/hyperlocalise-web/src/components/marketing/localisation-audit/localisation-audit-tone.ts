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
import type { LocalisationAuditCriterion } from "@/lib/localisation-audit/criteria";
import type { LocalisationAuditTone } from "@/lib/localisation-audit/score-tone";

export const CRITERION_STATUS_TONE = {
  pass: "safe",
  watch: "watch",
  fail: "risk",
  na: "neutral",
} as const satisfies Record<LocalisationAuditCriterion["status"], LocalisationAuditTone>;

export function auditToneTextClass(tone: LocalisationAuditTone) {
  switch (tone) {
    case "safe":
      return "text-grove-900 dark:text-grove-300";
    case "watch":
      return "text-beam-900 dark:text-warning-foreground";
    case "risk":
      return "text-red-900";
    case "info":
      return "text-blue-1000 dark:text-blue-900";
    default:
      return "text-muted-foreground";
  }
}

export function auditToneBadgeClass(tone: LocalisationAuditTone) {
  switch (tone) {
    case "safe":
      return "border-grove-700/25 bg-grove-100 text-grove-900 dark:border-grove-500/30 dark:bg-grove-100 dark:text-grove-900";
    case "watch":
      return "border-beam-700/30 bg-beam-100 text-beam-900";
    case "risk":
      return "border-red-700/25 bg-red-100 text-red-900";
    case "info":
      return "border-blue-700/25 bg-blue-100 text-blue-1000 dark:border-blue-600/30 dark:bg-blue-100 dark:text-blue-900";
    default:
      return "border-border text-muted-foreground";
  }
}

/** Solid fills for bars, rings, and legend swatches. */
export function auditToneFillClass(tone: LocalisationAuditTone) {
  switch (tone) {
    case "safe":
      return "bg-success";
    case "watch":
      return "bg-warning";
    case "risk":
      return "bg-destructive";
    case "info":
      return "bg-blue-700";
    default:
      return "bg-muted-foreground/40";
  }
}

export function auditToneStrokeClass(tone: LocalisationAuditTone) {
  switch (tone) {
    case "safe":
      return "stroke-success";
    case "watch":
      return "stroke-warning";
    case "risk":
      return "stroke-destructive";
    default:
      return "stroke-muted-foreground";
  }
}
