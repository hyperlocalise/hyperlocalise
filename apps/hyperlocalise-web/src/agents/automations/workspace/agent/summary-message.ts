import type { WorkspaceOrchestratorSession } from "./context";

export function buildOrchestratorRunSummaryMessage(session: WorkspaceOrchestratorSession) {
  const statusLabel = (session.terminalStatus ?? session.run.status).toUpperCase();
  const lines = [
    `Automation "${session.automation.name}" finished with status ${statusLabel}.`,
    `Trigger: ${session.run.triggerSource}.`,
  ];

  const githubResult = session.stepResults.run_github_workflows;
  if (githubResult) {
    lines.push(`GitHub: ${JSON.stringify(githubResult)}`);
  }

  const contentfulResult = session.stepResults.run_contentful_translation;
  if (contentfulResult) {
    lines.push(`Contentful: ${JSON.stringify(contentfulResult)}`);
  }

  if (session.terminalError) {
    lines.push(`Error: ${session.terminalError}`);
  } else if (session.run.error) {
    lines.push(`Error: ${JSON.stringify(session.run.error)}`);
  }

  return lines.join("\n");
}
