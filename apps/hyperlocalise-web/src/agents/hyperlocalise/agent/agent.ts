import { composeInstructions } from "@/agents/_runtime/compose-instructions";

export type HyperlocaliseAgentSurface = "web" | "slack" | "github";

export const hyperlocaliseAgentStepLimit = 10;
export const hyperlocaliseAgentMaxOutputTokens = 4_000;

export function buildHyperlocaliseBaseInstructions(input: {
  surface: HyperlocaliseAgentSurface;
  projectId: string | null;
  additionalInstructions?: string;
}) {
  const dynamicSections: string[] = [];

  if (input.surface === "slack") {
    dynamicSections.push(
      "Keep responses concise and Slack-friendly. Use short Markdown with bullets, bold labels, and a small number of relevant emoji when it improves readability.",
    );
  } else if (input.surface === "github") {
    dynamicSections.push(
      "Keep GitHub replies concise, concrete, and focused on the requested repository action.",
    );
  }

  if (input.projectId) {
    dynamicSections.push(
      "Project context:",
      `- This conversation is attached to project ${input.projectId}.`,
    );
  }

  if (input.additionalInstructions?.trim()) {
    dynamicSections.push("Surface-specific instructions:", input.additionalInstructions.trim());
  }

  return composeInstructions({
    agentId: "hyperlocalise",
    dynamicSections,
  });
}

export function buildOrchestratorBaseInstructions(input: {
  surface: HyperlocaliseAgentSurface;
  projectId: string | null;
  additionalInstructions?: string;
}) {
  return composeInstructions({
    agentId: "hyperlocalise",
    skills: ["orchestration", "repository-handoff"],
    dynamicSections: [buildHyperlocaliseBaseInstructions(input)],
  });
}
