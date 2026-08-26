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
  deriveProjectIdentifierCandidate,
  extractProjectIdentifierPrefix,
  formatIssueId,
  isLegacyIssueUuid,
  issueIdSchema,
  projectIssueIdentifierSchema,
  uniquifyProjectIdentifier,
} from "./project-issue-identifier";

describe("projectIssueIdentifierSchema", () => {
  it("uppercases and accepts valid prefixes", () => {
    expect(projectIssueIdentifierSchema.parse("hl")).toBe("HL");
    expect(projectIssueIdentifierSchema.parse("APP2")).toBe("APP2");
  });

  it("rejects invalid prefixes", () => {
    expect(() => projectIssueIdentifierSchema.parse("")).toThrow();
    expect(() => projectIssueIdentifierSchema.parse("1AB")).toThrow();
    expect(() => projectIssueIdentifierSchema.parse("TOO-LONG-PREFIX")).toThrow();
  });
});

describe("issueIdSchema", () => {
  it("accepts PREFIX-N", () => {
    expect(issueIdSchema.parse("HL-1")).toBe("HL-1");
    expect(issueIdSchema.parse("APP2-42")).toBe("APP2-42");
  });

  it("detects legacy UUID issue ids", () => {
    expect(isLegacyIssueUuid("2f4d8d7b-7c42-4fd8-bc9f-0a9f4c3f5d21")).toBe(true);
    expect(isLegacyIssueUuid("HL-1")).toBe(false);
  });

  it("accepts legacy UUID primary keys", () => {
    expect(issueIdSchema.parse("2f4d8d7b-7c42-4fd8-bc9f-0a9f4c3f5d21")).toBe(
      "2f4d8d7b-7c42-4fd8-bc9f-0a9f4c3f5d21",
    );
  });

  it("rejects zero-padded numbers and lowercase prefixes", () => {
    expect(() => issueIdSchema.parse("HL-0")).toThrow();
    expect(() => issueIdSchema.parse("hl-1")).toThrow();
  });
});

describe("formatIssueId", () => {
  it("joins prefix and number", () => {
    expect(formatIssueId("HL", 123)).toBe("HL-123");
  });
});

describe("extractProjectIdentifierPrefix", () => {
  it("extracts PREFIX from PREFIX-N", () => {
    expect(extractProjectIdentifierPrefix("HL-123")).toBe("HL");
    expect(extractProjectIdentifierPrefix("APP2-1")).toBe("APP2");
  });

  it("returns null for non-matching identifiers", () => {
    expect(extractProjectIdentifierPrefix("not-an-id")).toBeNull();
    expect(extractProjectIdentifierPrefix("2f4d8d7b-7c42-4fd8-bc9f-0a9f4c3f5d21")).toBeNull();
  });
});

describe("deriveProjectIdentifierCandidate", () => {
  it("uses word initials when possible", () => {
    expect(deriveProjectIdentifierCandidate("Hyper Local App")).toBe("HLA");
  });

  it("falls back to leading letters for short names", () => {
    expect(deriveProjectIdentifierCandidate("App")).toBe("APP");
  });

  it("falls back to PROJ for empty or symbol-only names", () => {
    expect(deriveProjectIdentifierCandidate("!!!")).toBe("PROJ");
    expect(deriveProjectIdentifierCandidate("")).toBe("PROJ");
  });
});

describe("uniquifyProjectIdentifier", () => {
  it("returns the candidate when free", () => {
    expect(uniquifyProjectIdentifier("HL", new Set())).toBe("HL");
  });

  it("appends numeric suffixes when taken", () => {
    expect(uniquifyProjectIdentifier("HL", new Set(["HL"]))).toBe("HL2");
    expect(uniquifyProjectIdentifier("HL", new Set(["HL", "HL2"]))).toBe("HL3");
  });
});
