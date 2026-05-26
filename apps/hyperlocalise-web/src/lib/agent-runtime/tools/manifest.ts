import type { ToolSet } from "ai";

import type { RepositoryAgentTaskSource } from "@/lib/agents/repository-agent-task";

export type AgentToolSideEffect = "none" | "workspace_write" | "external_write";
export type AgentToolDomain = "translation" | "repo" | "tms" | "project";

export type ToolManifest = {
  name: string;
  domain: AgentToolDomain;
  sideEffect: AgentToolSideEffect;
  requiredWorkspaceCapability?: "repo_read" | "repo_write";
  allowedSources?: RepositoryAgentTaskSource[];
};

export const toolManifests = [
  { name: "createTranslationJob", domain: "translation", sideEffect: "external_write" },
  {
    name: "searchRepoFiles",
    domain: "repo",
    sideEffect: "none",
    requiredWorkspaceCapability: "repo_read",
  },
  {
    name: "readRepoFile",
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
] satisfies ToolManifest[];

export type ToolManifestName = (typeof toolManifests)[number]["name"];

export function filterToolSetByNames(tools: ToolSet, names: string[]): ToolSet {
  const allowed = new Set(names);
  return Object.fromEntries(Object.entries(tools).filter(([name]) => allowed.has(name))) as ToolSet;
}
