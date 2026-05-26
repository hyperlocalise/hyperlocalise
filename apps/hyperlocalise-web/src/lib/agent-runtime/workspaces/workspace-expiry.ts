export type WorkspaceExpiryDecision =
  | { action: "keep"; reason: "active" }
  | { action: "expire"; reason: "idle_timeout" | "max_lifetime" };

export function decideWorkspaceExpiry(input: {
  now: Date;
  lastActivityAt: Date;
  createdAt: Date;
  idleTimeoutMs: number;
  maxLifetimeMs: number;
}): WorkspaceExpiryDecision {
  const now = input.now.getTime();
  if (now - input.createdAt.getTime() >= input.maxLifetimeMs) {
    return { action: "expire", reason: "max_lifetime" };
  }
  if (now - input.lastActivityAt.getTime() >= input.idleTimeoutMs) {
    return { action: "expire", reason: "idle_timeout" };
  }
  return { action: "keep", reason: "active" };
}
