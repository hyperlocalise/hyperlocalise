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

import type { TranslationQaSeverity } from "./types";

export const QA_FINDING_ISSUE_METADATA_KEY = "qaFinding";

export type QaFindingIssueMetadata = {
  runId: string;
  findingId: string;
  checkType: string;
  severity: TranslationQaSeverity;
  editorHref: string;
};

export function buildQaFindingExternalRef(input: {
  projectId: string;
  runId: string;
  findingKey: string;
  checkType: string;
}): string {
  const raw = `${input.projectId}:${input.runId}:${input.findingKey}:${input.checkType}`;
  if (raw.length <= 505) {
    return `qa:${raw}`;
  }
  const digest = createHash("sha256").update(raw).digest("hex").slice(0, 32);
  return `qa:${input.projectId}:${input.runId}:${digest}`;
}

export function buildQaFindingIssueMetadata(input: {
  runId: string;
  findingId: string;
  checkType: string;
  severity: TranslationQaSeverity;
  editorHref: string;
}): Record<string, unknown> {
  return {
    [QA_FINDING_ISSUE_METADATA_KEY]: {
      runId: input.runId,
      findingId: input.findingId,
      checkType: input.checkType,
      severity: input.severity,
      editorHref: input.editorHref,
    } satisfies QaFindingIssueMetadata,
  };
}

export function buildQaFindingIssueTitle(input: {
  checkType: string;
  findingKey: string;
  targetLocale: string;
}): string {
  const base = `[QA] ${input.checkType} · ${input.findingKey} (${input.targetLocale})`;
  return base.length <= 300 ? base : `${base.slice(0, 297)}...`;
}

export function buildQaFindingIssueDescription(input: {
  checkType: string;
  message: string;
  sourceText: string;
  targetText: string;
  editorHref: string;
}): string {
  return [
    "## Which check",
    input.checkType,
    "",
    "## Message",
    input.message,
    "",
    "## Expected (source)",
    input.sourceText,
    "",
    "## Actual (target)",
    input.targetText,
    "",
    "## Open in editor",
    input.editorHref,
  ].join("\n");
}
