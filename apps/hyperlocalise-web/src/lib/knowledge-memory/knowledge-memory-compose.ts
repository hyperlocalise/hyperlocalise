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

export function composeScopedKnowledgeMemory(input: {
  projectGuideline?: string | null;
  workspaceGuideline?: string | null;
  uploadedGuidelines?: string | null;
}): string {
  const projectGuideline = input.projectGuideline?.trim() ?? "";
  const workspaceGuideline = input.workspaceGuideline?.trim() ?? "";
  const uploadedGuidelines = input.uploadedGuidelines?.trim() ?? "";

  const typed =
    projectGuideline && workspaceGuideline
      ? [
          "## Project guideline",
          projectGuideline,
          "## Workspace guideline",
          workspaceGuideline,
        ].join("\n\n")
      : projectGuideline || workspaceGuideline;

  if (!uploadedGuidelines) {
    return typed;
  }
  return [typed, "## Uploaded guidelines", uploadedGuidelines].filter(Boolean).join("\n\n");
}
