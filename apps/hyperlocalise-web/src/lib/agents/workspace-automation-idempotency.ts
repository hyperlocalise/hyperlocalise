export function buildWorkspaceScheduledAutomationIdempotencyKey(input: {
  automationId: string;
  configVersion: number;
  scheduledRunAt: Date;
}): string {
  return [
    "workspace-automation:scheduled",
    input.automationId,
    String(input.configVersion),
    input.scheduledRunAt.toISOString(),
  ].join(":");
}

export function buildWorkspaceGithubPushAutomationIdempotencyKey(input: {
  automationId: string;
  configVersion: number;
  githubDeliveryId: string;
}): string {
  return [
    "workspace-automation:github-push",
    input.automationId,
    String(input.configVersion),
    input.githubDeliveryId,
  ].join(":");
}

export function buildWorkspaceManualAutomationIdempotencyKey(input: {
  automationId: string;
  configVersion: number;
  idempotencyKey: string;
}): string {
  return [
    "workspace-automation:manual",
    input.automationId,
    String(input.configVersion),
    input.idempotencyKey,
  ].join(":");
}
