import type { ToolSet } from "ai";

import {
  repositoryWorkflowToolNames,
  repositoryWorkspaceToolNames,
} from "@/lib/agent-contracts/repository-workspace-tools";
import type { RepositoryAgentTaskSource } from "@/lib/agent-contracts/repository-task";

export { repositoryWorkflowToolNames, repositoryWorkspaceToolNames };

export type AgentToolSideEffect = "none" | "workspace_write" | "external_write";
export type AgentToolDomain = "translation" | "repo" | "tms" | "project" | "session" | "web";

export type ToolManifest = {
  name: string;
  domain: AgentToolDomain;
  sideEffect: AgentToolSideEffect;
  requiredWorkspaceCapability?: "repo_read" | "repo_write";
  allowedSources?: RepositoryAgentTaskSource[];
};

export const toolManifests = [
  { name: "task", domain: "tms", sideEffect: "none" },
  { name: "createTranslationJob", domain: "translation", sideEffect: "external_write" },
  { name: "translate_string", domain: "translation", sideEffect: "none" },
  { name: "todoWrite", domain: "session", sideEffect: "none" },
  { name: "fetch", domain: "web", sideEffect: "none" },
  {
    name: "read",
    domain: "repo",
    sideEffect: "none",
    requiredWorkspaceCapability: "repo_read",
  },
  {
    name: "grep",
    domain: "repo",
    sideEffect: "none",
    requiredWorkspaceCapability: "repo_read",
  },
  {
    name: "fuzzySearch",
    domain: "repo",
    sideEffect: "none",
    requiredWorkspaceCapability: "repo_read",
  },
  {
    name: "glob",
    domain: "repo",
    sideEffect: "none",
    requiredWorkspaceCapability: "repo_read",
  },
  {
    name: "bash",
    domain: "repo",
    sideEffect: "none",
    requiredWorkspaceCapability: "repo_read",
  },
  {
    name: "detectRepoConfig",
    domain: "repo",
    sideEffect: "none",
    requiredWorkspaceCapability: "repo_read",
  },
  {
    name: "repoGitState",
    domain: "repo",
    sideEffect: "none",
    requiredWorkspaceCapability: "repo_read",
  },
  {
    name: "runHyperlocaliseCli",
    domain: "repo",
    sideEffect: "none",
    requiredWorkspaceCapability: "repo_read",
  },
] satisfies ToolManifest[];

export type ToolManifestName = (typeof toolManifests)[number]["name"];

export function filterToolSetByNames(tools: ToolSet, names: string[]): ToolSet {
  const allowed = new Set(names);
  return Object.fromEntries(Object.entries(tools).filter(([name]) => allowed.has(name))) as ToolSet;
}
