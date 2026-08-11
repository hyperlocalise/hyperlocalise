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
import type { LocalisationAuditFinding } from "./types";

export function scoreLocalisationAudit(findings: LocalisationAuditFinding[]): number {
  let score = 100;
  for (const finding of findings) {
    switch (finding.severity) {
      case "critical":
        score -= 18;
        break;
      case "warning":
        score -= 8;
        break;
      case "info":
        score -= 2;
        break;
    }
  }
  return Math.max(0, Math.min(100, score));
}

export function pickHeadlineFindings(
  findings: LocalisationAuditFinding[],
  limit = 3,
): LocalisationAuditFinding[] {
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return findings.toSorted((a, b) => rank[a.severity] - rank[b.severity]).slice(0, limit);
}
