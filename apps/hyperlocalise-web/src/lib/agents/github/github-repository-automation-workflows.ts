import type { GithubRepoAutomationDispatchPayload } from "./github-repository-automation-settings";

export function githubRepositoryAutomationJobHasRunnableWorkflow(
  workflows: GithubRepoAutomationDispatchPayload["workflows"],
): boolean {
  return workflows.pushSource || workflows.pullTranslations || workflows.validation;
}
