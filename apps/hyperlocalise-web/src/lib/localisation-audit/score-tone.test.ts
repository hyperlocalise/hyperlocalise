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

import {
  emailAuditToneColor,
  emailAuditToneFill,
  formatDimensionScore,
  leaderboardScoreTone,
  scoreTone,
  severityTone,
} from "./score-tone";

describe("scoreTone", () => {
  it("maps score bands onto semantic tones", () => {
    expect(scoreTone(92)).toBe("safe");
    expect(scoreTone(75)).toBe("safe");
    expect(scoreTone(64)).toBe("watch");
    expect(scoreTone(50)).toBe("watch");
    expect(scoreTone(49)).toBe("risk");
    expect(scoreTone(12)).toBe("risk");
    expect(scoreTone(null)).toBe("neutral");
  });
});

describe("leaderboardScoreTone", () => {
  it("colors bars green above 75, yellow above 65, and red otherwise", () => {
    expect(leaderboardScoreTone(100)).toBe("safe");
    expect(leaderboardScoreTone(76)).toBe("safe");
    expect(leaderboardScoreTone(75)).toBe("watch");
    expect(leaderboardScoreTone(66)).toBe("watch");
    expect(leaderboardScoreTone(65)).toBe("risk");
    expect(leaderboardScoreTone(12)).toBe("risk");
  });
});

describe("formatDimensionScore", () => {
  it("renders N/A when a dimension was not scored", () => {
    expect(formatDimensionScore(86)).toBe("86");
    expect(formatDimensionScore(null)).toBe("N/A");
    expect(formatDimensionScore(undefined)).toBe("N/A");
  });
});

describe("severityTone", () => {
  it("maps finding severity onto semantic tones", () => {
    expect(severityTone("critical")).toBe("risk");
    expect(severityTone("high")).toBe("risk");
    expect(severityTone("warning")).toBe("watch");
    expect(severityTone("medium")).toBe("watch");
    expect(severityTone("low")).toBe("info");
    expect(severityTone("info")).toBe("neutral");
  });
});

describe("emailAuditToneColor", () => {
  it("returns distinct colors for each tone", () => {
    const tones = ["safe", "watch", "risk", "info", "neutral"] as const;
    const colors = tones.map((tone) => emailAuditToneColor(tone));
    expect(new Set(colors).size).toBe(tones.length);
  });
});

describe("emailAuditToneFill", () => {
  it("returns a fill distinct from the text color", () => {
    expect(emailAuditToneFill("safe")).not.toBe(emailAuditToneColor("safe"));
    expect(emailAuditToneFill("watch")).not.toBe(emailAuditToneColor("watch"));
    expect(emailAuditToneFill("risk")).not.toBe(emailAuditToneColor("risk"));
  });
});
