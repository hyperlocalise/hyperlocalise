import { createHash } from "node:crypto";

export function buildGithubPushAutomationIdempotencyKey(input: {
  organizationId: string;
  githubInstallationRepositoryId: string;
  githubRepositoryId: string;
  branch: string;
  commitBefore: string;
  commitAfter: string;
  configVersion: number;
}): string {
  const digest = createHash("sha256")
    .update(
      [
        input.organizationId,
        input.githubInstallationRepositoryId,
        input.githubRepositoryId,
        input.branch,
        input.commitBefore,
        input.commitAfter,
        String(input.configVersion),
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 32);
  return `push:${digest}`;
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
  organizationId: string;
  githubInstallationRepositoryId: string;
  githubRepositoryId: string;
  branch: string;
  commitBefore: string;
  commitAfter: string;
  configVersion: number;
  skipReason: string;
}): string {
  const digest = createHash("sha256")
    .update(
      [
        input.organizationId,
        input.githubInstallationRepositoryId,
        input.githubRepositoryId,
        input.branch,
        input.commitBefore,
        input.commitAfter,
        String(input.configVersion),
        input.skipReason,
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 32);
  return `push-skip:${digest}`;
}
