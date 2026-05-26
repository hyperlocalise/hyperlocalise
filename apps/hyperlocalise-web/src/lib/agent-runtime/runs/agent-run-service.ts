export type AgentRunStatus =
  | "queued"
  | "planning"
  | "preparing_workspace"
  | "running"
  | "awaiting_approval"
  | "finalizing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type AgentRunState = {
  id: string;
  status: AgentRunStatus;
  workflowRunId?: string | null;
  workspaceSessionId?: string | null;
};
