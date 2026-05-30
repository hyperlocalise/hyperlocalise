import { describe, expect, it } from "vite-plus/test";

import {
  buildCommitRangeLogArgs,
  buildCommitScopedDiffArgs,
  buildCommitScopedPatchArgs,
  classifyHlCheckReport,
  isZeroCommitSha,
  parseCommitLogLines,
  parseNameOnlyDiffPaths,
  shouldSkipCommitForPaths,
} from "./github-repository-automation-commits";

describe("github repository automation commits", () => {
  it("detects zero commit shas", () => {
    expect(isZeroCommitSha("0000000000000000000000000000000000000000")).toBe(true);
    expect(isZeroCommitSha("abc123")).toBe(false);
    expect(isZeroCommitSha(null)).toBe(true);
  });

  it("parses commit log lines", () => {
    expect(parseCommitLogLines("aaa111\tparent111\nbbb222\tparent222\n")).toEqual([
      { sha: "aaa111", parentSha: "parent111" },
      { sha: "bbb222", parentSha: "parent222" },
    ]);
  });

  it("builds commit range log args for first push and ranges", () => {
    expect(
      buildCommitRangeLogArgs({
        commitBefore: "0000000000000000000000000000000000000000",
        commitAfter: "head123",
      }),
    ).toEqual(["log", "--reverse", "--format=%H%x09%P", "-n", "50", "head123"]);

    expect(
      buildCommitRangeLogArgs({
        commitBefore: "before123",
        commitAfter: "after456",
      }),
    ).toEqual(["log", "--reverse", "--format=%H%x09%P", "-n", "50", "before123..after456"]);
  });

  it("parses name-only diff paths", () => {
    expect(parseNameOnlyDiffPaths("locales/en.json\nlocales\\fr.json\n\n")).toEqual([
      "locales/en.json",
      "locales/fr.json",
    ]);
  });

  it("builds scoped diff and patch args", () => {
    expect(
      buildCommitScopedDiffArgs({
        parentSha: "parent",
        commitSha: "child",
        paths: ["locales/**"],
      }),
    ).toEqual(["diff", "--name-only", "parent..child", "--", "locales/**"]);

    expect(
      buildCommitScopedPatchArgs({
        parentSha: null,
        commitSha: "root",
        paths: ["locales/en.json"],
      }),
    ).toEqual(["diff", "root", "--", "locales/en.json"]);
  });

  it("skips commits without configured localisation path changes", () => {
    const patterns = {
      sourcePatterns: ["locales/en.json"],
      targetPatterns: ["locales/{{locale}}.json"],
    };

    expect(
      shouldSkipCommitForPaths({
        changedPaths: ["README.md"],
        patterns,
      }),
    ).toEqual({
      skipped: true,
      reason: "no_configured_localisation_paths_changed",
    });

    expect(
      shouldSkipCommitForPaths({
        changedPaths: ["locales/en.json", "README.md"],
        patterns,
      }),
    ).toEqual({
      skipped: false,
      paths: ["locales/en.json"],
    });
  });

  it("classifies hl check reports by severity", () => {
    const emptyReport = {
      checks: [],
      findings: [],
      summary: { total: 0 },
    };

    expect(classifyHlCheckReport(emptyReport)).toBe("passed");
    expect(
      classifyHlCheckReport({
        checks: ["keys"],
        findings: [{ type: "missing_key", severity: "warning", sourceFile: "a.json" }],
        summary: { total: 1 },
      }),
    ).toBe("warning");
    expect(
      classifyHlCheckReport({
        checks: ["keys"],
        findings: [{ type: "missing_key", severity: "error", sourceFile: "a.json" }],
        summary: { total: 1 },
      }),
    ).toBe("failed");
  });
});
