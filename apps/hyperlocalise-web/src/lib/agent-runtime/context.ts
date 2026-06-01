import type { HyperlocaliseAgentSurface } from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import type {
  HyperlocaliseConversationIntent,
  HyperlocaliseConversationMode,
} from "@/lib/agent-runtime/loops/conversation-mode";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";

/**
 * Request-scoped runtime state shared by the orchestrator and task tool.
 * Passed through ToolLoopAgent `experimental_context` when using prepareCall.
 */
export type HyperlocaliseAgentRuntimeContext = {
  surface: HyperlocaliseAgentSurface;
  toolContext: ToolContext;
  /** Active intents for this turn (translation and repository may both apply). */
  suggestedIntents: HyperlocaliseConversationIntent[];
  /** Primary orchestrator hint derived from suggestedIntents. */
  suggestedMode: HyperlocaliseConversationMode;
  hasFileAttachments: boolean;
  additionalInstructions?: string;
};

export type HyperlocaliseAgentRuntimeContextError =
  | { code: "runtime_context_missing" }
  | { code: "runtime_context_incomplete" };

export function formatAgentRuntimeContextError(
  error: HyperlocaliseAgentRuntimeContextError,
): string {
  switch (error.code) {
    case "runtime_context_missing":
      return "Hyperlocalise agent runtime context is missing.";
    case "runtime_context_incomplete":
      return "Hyperlocalise agent runtime context is incomplete.";
  }
}

export function resolveAgentRuntimeContext(
  experimentalContext: unknown,
): Result<HyperlocaliseAgentRuntimeContext, HyperlocaliseAgentRuntimeContextError> {
  if (!experimentalContext || typeof experimentalContext !== "object") {
    return err({ code: "runtime_context_missing" });
  }

  const context = experimentalContext as Partial<HyperlocaliseAgentRuntimeContext>;
  if (
    !context.toolContext ||
    !context.surface ||
    !context.suggestedMode ||
    !context.suggestedIntents ||
    context.suggestedIntents.length === 0
  ) {
    return err({ code: "runtime_context_incomplete" });
  }

  return ok({
    surface: context.surface,
    toolContext: context.toolContext,
    suggestedIntents: context.suggestedIntents,
    suggestedMode: context.suggestedMode,
    hasFileAttachments: context.hasFileAttachments ?? false,
    additionalInstructions: context.additionalInstructions,
  });
}

export function getAgentRuntimeContext(
  experimentalContext: unknown,
): HyperlocaliseAgentRuntimeContext {
  const contextResult = resolveAgentRuntimeContext(experimentalContext);
  if (isErr(contextResult)) {
    throw new Error(formatAgentRuntimeContextError(contextResult.error));
  }

  return contextResult.value;
}
