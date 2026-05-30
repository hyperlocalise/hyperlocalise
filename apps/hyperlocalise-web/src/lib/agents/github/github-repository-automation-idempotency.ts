import { createHash } from "node:crypto";

export function buildGithubPushAutomationIdempotencyKey(input: {
  githubDeliveryId: string;
}): string {
  return `push:${input.githubDeliveryId}`;
}

export function buildGithubScheduledAutomationIdempotencyKey(input: {
  githubInstallationRepositoryId: string;
  configVersion: number;
  scheduledRunAt: Date;
}): string {
  return [
    "scheduled",
    input.githubInstallationRepositoryId,
    String(input.configVersion),
    input.scheduledRunAt.toISOString(),
  ].join(":");
}

export function buildGithubPushSkipIdempotencyKey(input: {
  githubDeliveryId: string;
  skipReason: string;
}): string {
  const digest = createHash("sha256")
    .update(`${input.githubDeliveryId}:${input.skipReason}`)
    .digest("hex")
    .slice(0, 32);
  return `push-skip:${digest}`;
}
