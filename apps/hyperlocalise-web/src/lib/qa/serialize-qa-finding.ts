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
import { buildTranslationQaFindingHref } from "./finding-href";

export function serializeTranslationQaFinding(input: {
  organizationSlug: string;
  projectId: string;
  finding: {
    id: string;
    runId: string;
    key: string;
    sourcePath: string | null;
    targetLocale: string;
    checkType: string;
    severity: "error" | "warning";
    category: string;
    message: string;
    relatedTokens: string[];
    sourceText: string;
    targetText: string;
  };
}) {
  return {
    id: input.finding.id,
    runId: input.finding.runId,
    projectId: input.projectId,
    key: input.finding.key,
    sourcePath: input.finding.sourcePath,
    targetLocale: input.finding.targetLocale,
    checkType: input.finding.checkType,
    severity: input.finding.severity,
    category: input.finding.category,
    message: input.finding.message,
    relatedTokens: input.finding.relatedTokens,
    sourceText: input.finding.sourceText,
    targetText: input.finding.targetText,
    editorHref: buildTranslationQaFindingHref({
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      sourcePath: input.finding.sourcePath,
      targetLocale: input.finding.targetLocale,
      key: input.finding.key,
    }),
  };
}
