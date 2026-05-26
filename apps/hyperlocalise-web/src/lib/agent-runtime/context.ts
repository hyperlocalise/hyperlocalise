import type { HyperlocaliseAgentSurface } from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import type { HyperlocaliseConversationMode } from "@/lib/agent-runtime/loops/conversation-mode";
import type { ToolContext } from "@/lib/tools/types";

/**
 * Request-scoped runtime state shared by the orchestrator and task tool.
 * Passed through ToolLoopAgent `experimental_context` when using prepareCall.
 */
export type HyperlocaliseAgentRuntimeContext = {
  surface: HyperlocaliseAgentSurface;
  toolContext: ToolContext;
  suggestedMode: HyperlocaliseConversationMode;
  hasFileAttachments: boolean;
  additionalInstructions?: string;
};

export function getAgentRuntimeContext(
  experimentalContext: unknown,
): HyperlocaliseAgentRuntimeContext {
  if (!experimentalContext || typeof experimentalContext !== "object") {
    throw new Error("Hyperlocalise agent runtime context is missing.");
  }

  const context = experimentalContext as Partial<HyperlocaliseAgentRuntimeContext>;
  if (!context.toolContext || !context.surface || !context.suggestedMode) {
    throw new Error("Hyperlocalise agent runtime context is incomplete.");
  }

  return {
    surface: context.surface,
    toolContext: context.toolContext,
    suggestedMode: context.suggestedMode,
    hasFileAttachments: context.hasFileAttachments ?? false,
    additionalInstructions: context.additionalInstructions,
  };
}
