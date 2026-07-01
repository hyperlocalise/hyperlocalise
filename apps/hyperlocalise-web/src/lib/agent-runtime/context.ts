import type { HyperlocaliseAgentSurface } from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";

/**
 * Request-scoped runtime state for the conversational skill agent.
 */
export type HyperlocaliseAgentRuntimeContext = {
  surface: HyperlocaliseAgentSurface;
  toolContext: ToolContext;
  hasFileAttachments: boolean;
  hasTmsIntegration: boolean;
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
  if (!context.toolContext || !context.surface) {
    return err({ code: "runtime_context_incomplete" });
  }

  return ok({
    surface: context.surface,
    toolContext: context.toolContext,
    hasFileAttachments: context.hasFileAttachments ?? false,
    hasTmsIntegration: context.hasTmsIntegration ?? false,
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
