export class AgentRunCancelledError extends Error {
  constructor(message = "Agent run was cancelled.") {
    super(message);
    this.name = "AgentRunCancelledError";
  }
}

export function assertAgentRunNotCancelled(input: { cancelledAt?: Date | null }) {
  if (input.cancelledAt) {
    throw new AgentRunCancelledError();
  }
}
