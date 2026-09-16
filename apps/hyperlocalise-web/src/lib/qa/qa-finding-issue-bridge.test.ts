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

import { buildQaFindingExternalRef, buildQaFindingIssueMetadata } from "./qa-finding-issue-bridge";

describe("qa finding issue bridge", () => {
  it("builds a stable external ref from project, run, key, and check type", () => {
    expect(
      buildQaFindingExternalRef({
        projectId: "proj_1",
        runId: "11111111-1111-4111-8111-111111111111",
        findingKey: "hello",
        checkType: "placeholder_mismatch",
      }),
    ).toBe("qa:proj_1:11111111-1111-4111-8111-111111111111:hello:placeholder_mismatch");
  });

  it("hashes oversized external refs", () => {
    const ref = buildQaFindingExternalRef({
      projectId: "proj_1",
      runId: "11111111-1111-4111-8111-111111111111",
      findingKey: "k".repeat(600),
      checkType: "length",
    });
    expect(ref.startsWith("qa:proj_1:11111111-1111-4111-8111-111111111111:")).toBe(true);
    expect(ref.length).toBeLessThanOrEqual(512);
  });

  it("stores QA metadata on issues", () => {
    expect(
      buildQaFindingIssueMetadata({
        runId: "run",
        findingId: "finding",
        checkType: "glossary_violation",
        severity: "warning",
        editorHref: "/org/acme/projects/p/files/content-editor",
      }),
    ).toEqual({
      qaFinding: {
        runId: "run",
        findingId: "finding",
        checkType: "glossary_violation",
        severity: "warning",
        editorHref: "/org/acme/projects/p/files/content-editor",
      },
    });
  });
});
