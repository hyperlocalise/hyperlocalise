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

import { buildWorkspaceSourceUploadAutomationIdempotencyKey } from "./workspace-automation-idempotency";

const baseInput = {
  automationId: "automation-1",
  configVersion: 3,
  projectId: "project-1",
  sourcePath: "locales/en.json",
  sourceHash: "abc123",
  sourceFileVersionId: "version-1",
};

describe("buildWorkspaceSourceUploadAutomationIdempotencyKey", () => {
  it("uses content identity when a source hash is available", () => {
    const first = buildWorkspaceSourceUploadAutomationIdempotencyKey(baseInput);
    const duplicateVersion = buildWorkspaceSourceUploadAutomationIdempotencyKey({
      ...baseInput,
      sourceFileVersionId: "version-2",
    });

    expect(duplicateVersion).toBe(first);
  });

  it("distinguishes content identity and automation configuration changes", () => {
    const first = buildWorkspaceSourceUploadAutomationIdempotencyKey(baseInput);

    expect(
      buildWorkspaceSourceUploadAutomationIdempotencyKey({
        ...baseInput,
        projectId: "project-2",
      }),
    ).not.toBe(first);
    expect(
      buildWorkspaceSourceUploadAutomationIdempotencyKey({
        ...baseInput,
        sourcePath: "locales/other.json",
      }),
    ).not.toBe(first);
    expect(
      buildWorkspaceSourceUploadAutomationIdempotencyKey({
        ...baseInput,
        sourceHash: "def456",
      }),
    ).not.toBe(first);
    expect(
      buildWorkspaceSourceUploadAutomationIdempotencyKey({
        ...baseInput,
        configVersion: 4,
      }),
    ).not.toBe(first);
  });

  it("falls back to source-version identity when no hash is available", () => {
    const first = buildWorkspaceSourceUploadAutomationIdempotencyKey({
      ...baseInput,
      sourceHash: null,
    });
    const nextVersion = buildWorkspaceSourceUploadAutomationIdempotencyKey({
      ...baseInput,
      sourceHash: null,
      sourceFileVersionId: "version-2",
    });

    expect(first).toBe("workspace-automation:source-upload:automation-1:3:version-1");
    expect(nextVersion).not.toBe(first);
  });
});
