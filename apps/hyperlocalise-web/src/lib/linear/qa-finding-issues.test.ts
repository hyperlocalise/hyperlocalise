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
import { describe, expect, it, vi } from "vite-plus/test";

import { err, ok } from "@/lib/primitives/result/results";

import type { LinearClient } from "./client";
import {
  buildLinearQaFindingIssue,
  createLinearIssuesForQaFindings,
  type LinearQaFinding,
} from "./qa-finding-issues";

const finding: LinearQaFinding = {
  id: "00000000-0000-4000-8000-000000000001",
  projectId: "project_1",
  projectName: "Mobile app",
  sourcePath: "locales/en.json",
  key: "dose.reminder",
  targetLocale: "de-DE",
  checkType: "estimated_quality",
  severity: "error",
  message: "The dosage changed from 5 mg to 50 mg.",
  sourceText: "Take 5 mg daily.",
  targetText: "Täglich 50 mg einnehmen.",
};

describe("buildLinearQaFindingIssue", () => {
  it("names the check, language and key, and quotes source and translation", () => {
    const issue = buildLinearQaFindingIssue({
      finding,
      qaPageUrl: "https://app.example.test/org/acme/projects/project_1/qa",
    });

    expect(issue.title).toBe("Estimated quality in de-DE: dose.reminder");
    expect(issue.priority).toBe(2);
    expect(issue.description).toContain("The dosage changed from 5 mg to 50 mg.");
    expect(issue.description).toContain("**Project:** Mobile app");
    expect(issue.description).toContain("`locales/en.json` · `dose.reminder`");
    expect(issue.description).toContain("```\nTake 5 mg daily.\n```");
    expect(issue.description).toContain("```\nTäglich 50 mg einnehmen.\n```");
    expect(issue.description).toContain(
      "[Open QA in Hyperlocalise](https://app.example.test/org/acme/projects/project_1/qa)",
    );
  });

  it("keeps translated text from closing its code block", () => {
    const issue = buildLinearQaFindingIssue({
      finding: { ...finding, targetText: "a ``` b" },
      qaPageUrl: null,
    });

    expect(issue.description).not.toContain("a ``` b");
    expect(issue.description).not.toContain("Open QA in Hyperlocalise");
  });

  it("gives warnings medium priority", () => {
    expect(
      buildLinearQaFindingIssue({ finding: { ...finding, severity: "warning" }, qaPageUrl: null })
        .priority,
    ).toBe(3);
  });
});

describe("createLinearIssuesForQaFindings", () => {
  it("files one issue per finding and keeps going after a failure", async () => {
    const second = { ...finding, id: "00000000-0000-4000-8000-000000000002" };
    const createIssue = vi
      .fn<LinearClient["createIssue"]>()
      .mockResolvedValueOnce(
        ok({ id: "i1", identifier: "LOC-1", title: "t", url: "https://linear.app/i/LOC-1" }),
      )
      .mockResolvedValueOnce(err({ code: "linear_rate_limited", message: "Slow down." }));
    const client = { createIssue } as unknown as LinearClient;

    const results = await createLinearIssuesForQaFindings({
      client,
      teamId: "team_1",
      findings: [finding, second],
      qaPageUrl: () => null,
    });

    expect(createIssue).toHaveBeenCalledTimes(2);
    expect(createIssue.mock.calls[0]![0]).toMatchObject({ teamId: "team_1", priority: 2 });
    expect(results).toEqual([
      {
        findingId: finding.id,
        ok: true,
        identifier: "LOC-1",
        url: "https://linear.app/i/LOC-1",
      },
      { findingId: second.id, ok: false, code: "linear_rate_limited" },
    ]);
  });
});
