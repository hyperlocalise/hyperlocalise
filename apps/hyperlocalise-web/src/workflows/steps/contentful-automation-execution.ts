import type { ContentfulAutomationExecutionEventData } from "@/lib/workflow/types";

export async function executeContentfulAutomationStep(
  event: ContentfulAutomationExecutionEventData,
) {
  "use step";
  const { executeContentfulAutomation } = await import("@/lib/contentful/automation-executor");
  return executeContentfulAutomation(event);
}
