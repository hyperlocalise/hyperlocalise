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
export function buildVisualWorkflowScheduledIdempotencyKey(input: {
  visualWorkflowId: string;
  definitionVersion: number;
  scheduledRunAt: Date;
}): string {
  return [
    "visual-workflow:scheduled",
    input.visualWorkflowId,
    String(input.definitionVersion),
    input.scheduledRunAt.toISOString(),
  ].join(":");
}

export function buildVisualWorkflowGithubIdempotencyKey(input: {
  visualWorkflowId: string;
  definitionVersion: number;
  githubDeliveryId: string;
}): string {
  return [
    "visual-workflow:github",
    input.visualWorkflowId,
    String(input.definitionVersion),
    input.githubDeliveryId,
  ].join(":");
}

export function buildVisualWorkflowSourceUploadIdempotencyKey(input: {
  visualWorkflowId: string;
  definitionVersion: number;
  sourceFileId: string;
}): string {
  return [
    "visual-workflow:source-upload",
    input.visualWorkflowId,
    String(input.definitionVersion),
    input.sourceFileId,
  ].join(":");
}

export function buildVisualWorkflowManualIdempotencyKey(input: {
  visualWorkflowId: string;
  definitionVersion: number;
  idempotencyKey: string;
}): string {
  return [
    "visual-workflow:manual",
    input.visualWorkflowId,
    String(input.definitionVersion),
    input.idempotencyKey,
  ].join(":");
}
