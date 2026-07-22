/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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

export function buildWorkspaceGithubPushCommitAutomationIdempotencyKey(input: {
  automationId: string;
  configVersion: number;
  branch: string;
  commitBefore: string;
  commitAfter: string;
}): string {
  return [
    "workspace-automation:github-push-commit",
    input.automationId,
    String(input.configVersion),
    input.branch,
    input.commitBefore,
    input.commitAfter,
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

export function buildWorkspaceContentfulWebhookAutomationIdempotencyKey(input: {
  automationId: string;
  configVersion: number;
  contentfulWebhookEventId: string;
}): string {
  return [
    "workspace-automation:contentful-webhook",
    input.automationId,
    String(input.configVersion),
    input.contentfulWebhookEventId,
  ].join(":");
}

export function buildWorkspaceSourceUploadAutomationIdempotencyKey(input: {
  automationId: string;
  configVersion: number;
  sourceFileVersionId: string;
}): string {
  return [
    "workspace-automation:source-upload",
    input.automationId,
    String(input.configVersion),
    input.sourceFileVersionId,
  ].join(":");
}

export function buildWorkspaceContentfulScheduledAutomationIdempotencyKey(input: {
  automationId: string;
  configVersion: number;
  scheduledRunAt: Date;
}): string {
  return [
    "workspace-automation:contentful-scheduled",
    input.automationId,
    String(input.configVersion),
    input.scheduledRunAt.toISOString(),
  ].join(":");
}
