import type { RepositoryAgentGitHubContext } from "@/lib/agent-contracts/repository-task";

export type { RepositoryAgentGitHubContext };

export type SlackBotThreadState = {
  warnedNonMemberUsers?: string[];
  repositoryGitHubContext?: RepositoryAgentGitHubContext;
};
