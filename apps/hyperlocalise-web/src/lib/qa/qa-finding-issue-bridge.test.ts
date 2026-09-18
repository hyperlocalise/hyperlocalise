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
  it("builds a stable external ref from project, run, key, check type, and locale", () => {
    expect(
      buildQaFindingExternalRef({
        projectId: "proj_1",
        runId: "11111111-1111-4111-8111-111111111111",
        findingKey: "hello",
        checkType: "placeholder_mismatch",
        targetLocale: "de-DE",
      }),
    ).toBe("qa:proj_1:11111111-1111-4111-8111-111111111111:hello:placeholder_mismatch:de-DE");
  });

  it("uses different external refs per target locale", () => {
    const base = {
      projectId: "proj_1",
      runId: "11111111-1111-4111-8111-111111111111",
      findingKey: "hello",
      checkType: "not_localized",
    };
    expect(buildQaFindingExternalRef({ ...base, targetLocale: "de-DE" })).not.toBe(
      buildQaFindingExternalRef({ ...base, targetLocale: "fr-FR" }),
    );
  });

  it("hashes oversized external refs", () => {
    const ref = buildQaFindingExternalRef({
      projectId: "proj_1",
      runId: "11111111-1111-4111-8111-111111111111",
      findingKey: "k".repeat(600),
      checkType: "length",
      targetLocale: "en-US",
    });
    expect(ref.startsWith("qa:proj_1:11111111-1111-4111-8111-111111111111:")).toBe(true);
    expect(ref.length).toBeLessThanOrEqual(512);
  });

  it("keeps multi-byte UTF-16 under the Linear external-ref limit without hashing", () => {
    const runId = "11111111-1111-4111-8111-111111111111";
    const findingKey = "é".repeat(225);
    const raw = `proj_1:${runId}:${findingKey}:length:en-US`;
    expect(Buffer.byteLength(raw, "utf8")).toBeGreaterThan(505);
    expect(raw.length).toBeLessThanOrEqual(505);
    expect(
      buildQaFindingExternalRef({
        projectId: "proj_1",
        runId,
        findingKey,
        checkType: "length",
        targetLocale: "en-US",
      }),
    ).toBe(`qa:${raw}`);
  });

  it("hashes when astral-plane keys push past the UTF-16 unit limit", () => {
    const runId = "11111111-1111-4111-8111-111111111111";
    const findingKey = "😀".repeat(230);
    const raw = `proj_1:${runId}:${findingKey}:length:en-US`;
    expect(raw.length).toBeGreaterThan(505);

    const ref = buildQaFindingExternalRef({
      projectId: "proj_1",
      runId,
      findingKey,
      checkType: "length",
      targetLocale: "en-US",
    });
    expect(ref.startsWith(`qa:proj_1:${runId}:`)).toBe(true);
    expect(ref).not.toBe(`qa:${raw}`);
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
