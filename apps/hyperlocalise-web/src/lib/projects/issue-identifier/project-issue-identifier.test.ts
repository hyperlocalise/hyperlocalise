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
  deriveProjectIssueIdentifierCandidate,
  formatIssueIdentifier,
  projectIssueIdentifierSchema,
  uniquifyProjectIssueIdentifier,
} from "./project-issue-identifier";

describe("projectIssueIdentifierSchema", () => {
  it("uppercases and accepts valid prefixes", () => {
    expect(projectIssueIdentifierSchema.parse("hl")).toBe("HL");
    expect(projectIssueIdentifierSchema.parse("A1")).toBe("A1");
  });

  it("rejects invalid prefixes", () => {
    expect(() => projectIssueIdentifierSchema.parse("")).toThrow();
    expect(() => projectIssueIdentifierSchema.parse("1AB")).toThrow();
    expect(() => projectIssueIdentifierSchema.parse("too-long-prefix")).toThrow();
  });
});

describe("deriveProjectIssueIdentifierCandidate", () => {
  it("uses word initials", () => {
    expect(deriveProjectIssueIdentifierCandidate("Hyper Local App")).toBe("HLA");
  });

  it("falls back to leading letters", () => {
    expect(deriveProjectIssueIdentifierCandidate("App")).toBe("APP");
  });

  it("falls back to PROJ for empty or emoji-only names", () => {
    expect(deriveProjectIssueIdentifierCandidate("")).toBe("PROJ");
    expect(deriveProjectIssueIdentifierCandidate("🚀")).toBe("PROJ");
  });
});

describe("uniquifyProjectIssueIdentifier", () => {
  it("returns the candidate when free", () => {
    expect(uniquifyProjectIssueIdentifier("HL", new Set())).toBe("HL");
  });

  it("appends numeric suffixes on collision", () => {
    expect(uniquifyProjectIssueIdentifier("HL", new Set(["HL"]))).toBe("HL2");
    expect(uniquifyProjectIssueIdentifier("HL", new Set(["HL", "HL2"]))).toBe("HL3");
  });
});

describe("formatIssueIdentifier", () => {
  it("joins prefix and number", () => {
    expect(formatIssueIdentifier("HL", 123)).toBe("HL-123");
  });
});
