/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
