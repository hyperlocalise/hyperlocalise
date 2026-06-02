/** Workspace primitives for repository specialists and workflows. */
export const repositoryWorkspaceToolNames = [
  "grep",
  "fuzzySearch",
  "read",
  "glob",
  "detectRepoConfig",
  "todoWrite",
] as const;

/** Extended toolkit for long-running repository workflows. */
export const repositoryWorkflowToolNames = [
  ...repositoryWorkspaceToolNames,
  "bash",
  "repoGitState",
  "runHyperlocaliseCli",
] as const;
