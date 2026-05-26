import type { AgentRequest } from "./agent-request";
import type { TaskSpec } from "./task-spec";

export type AgentPlannerIntent =
  | "translation"
  | "repository"
  | "job_status"
  | "glossary_memory"
  | "project"
  | "general";

export function planAgentRequest(request: AgentRequest): TaskSpec {
  const text = request.input.text;
  const intent = classifyAgentRequestText(text);

  if (intent === "repository") {
    return {
      domain: "repository",
      operation: "inspect",
      requiredCapabilities: ["repo:read"],
      workspace: "repo_read",
      mutationPolicy: "none",
    };
  }

  if (intent === "translation") {
    return {
      domain: "translation",
      operation: "translate",
      requiredCapabilities: ["translation:create"],
      workspace: "none",
      mutationPolicy: "direct_write",
    };
  }

  return {
    domain:
      intent === "project" ? "project" : intent === "glossary_memory" ? "glossary" : "general",
    operation: "answer",
    requiredCapabilities: [],
    workspace: "none",
    mutationPolicy: "none",
  };
}

export function classifyAgentRequestText(text: string): AgentPlannerIntent {
  if (/\b(?:fix|review|check)\b/i.test(text) && /\b(?:pr|pull request)\b/i.test(text)) {
    return "general";
  }

  if (
    hasRepositoryContextLookupIntent(text) &&
    (/\b(?:pull request|pr)\s*#?\d+\b/i.test(text) || /github\.com\/[^/\s]+\/[^/\s]+/i.test(text))
  ) {
    return "repository";
  }
  if (/\b(?:repo|repository|github)\b/i.test(text) && hasRepositoryContextLookupIntent(text)) {
    return "repository";
  }
  if (
    /\b(job|jobs|workflow|workflows)\b/i.test(text) &&
    /\b(status|list|show|check)\b/i.test(text)
  ) {
    return "job_status";
  }
  if (/\b(glossar(?:y|ies)|term(?:s)?|translation memor(?:y|ies)|tmx|tm)\b/i.test(text)) {
    return "glossary_memory";
  }
  if (/\b(project|workspace)\b/i.test(text)) {
    return "project";
  }
  if (
    /\b(translat(?:e|ion|ing)|locali[sz](?:e|ation|ing)|source locale|target locale)\b/i.test(text)
  ) {
    return "translation";
  }
  return "general";
}

function hasRepositoryContextLookupIntent(text: string) {
  const contextAction =
    /\b(?:context|search|find(?:ing)?|locate|lookup|where|usage|surrounding|nearby)\b/i.test(text);
  const localizedStringSubject =
    /\b(?:locali[sz]ed|translated|message|messages|string|strings|copy|text)\b/i.test(text) ||
    /["'`][^"'`]+["'`]/.test(text);

  return contextAction && localizedStringSubject;
}
