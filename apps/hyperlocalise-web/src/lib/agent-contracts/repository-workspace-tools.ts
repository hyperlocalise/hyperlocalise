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
/** Workspace primitives for repository specialists and workflows. */
export const repositoryWorkspaceToolNames = [
  "grep",
  "fuzzySearch",
  "read",
  "glob",
  "detectRepoConfig",
  "gitHistory",
  "todoWrite",
  "write",
  "applyPatch",
] as const;

/** Extended toolkit for long-running repository workflows. */
export const repositoryWorkflowToolNames = [
  ...repositoryWorkspaceToolNames,
  "bash",
  "repoGitState",
  "runHyperlocaliseCli",
] as const;
