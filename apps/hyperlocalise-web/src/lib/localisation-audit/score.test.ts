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

import { pickHeadlineFindings, scoreLocalisationAudit } from "./score";
import type { LocalisationAuditFinding } from "./types";

function finding(
  severity: LocalisationAuditFinding["severity"],
  id: string,
): LocalisationAuditFinding {
  return {
    id,
    category: "technical",
    severity,
    title: id,
    summary: id,
  };
}

describe("scoreLocalisationAudit", () => {
  it("starts at 100 with no findings and clamps to [0, 100]", () => {
    expect(scoreLocalisationAudit([])).toBe(100);
    expect(
      scoreLocalisationAudit([
        finding("critical", "c1"),
        finding("critical", "c2"),
        finding("critical", "c3"),
        finding("critical", "c4"),
        finding("critical", "c5"),
        finding("critical", "c6"),
      ]),
    ).toBe(0);
  });

  it("applies severity weights for critical, warning, and info", () => {
    expect(
      scoreLocalisationAudit([
        finding("critical", "c1"),
        finding("warning", "w1"),
        finding("info", "i1"),
      ]),
    ).toBe(100 - 18 - 8 - 2);
  });
});

describe("pickHeadlineFindings", () => {
  it("orders by severity and respects the limit", () => {
    const findings = [
      finding("info", "i1"),
      finding("critical", "c1"),
      finding("warning", "w1"),
      finding("critical", "c2"),
      finding("warning", "w2"),
    ];

    expect(pickHeadlineFindings(findings, 3).map((item) => item.id)).toEqual(["c1", "c2", "w1"]);
    expect(pickHeadlineFindings(findings).map((item) => item.id)).toEqual(["c1", "c2", "w1"]);
    expect(pickHeadlineFindings(findings, 1).map((item) => item.id)).toEqual(["c1"]);
  });

  it("does not mutate the input order", () => {
    const findings = [finding("info", "i1"), finding("critical", "c1")];
    pickHeadlineFindings(findings, 2);
    expect(findings.map((item) => item.id)).toEqual(["i1", "c1"]);
  });
});
