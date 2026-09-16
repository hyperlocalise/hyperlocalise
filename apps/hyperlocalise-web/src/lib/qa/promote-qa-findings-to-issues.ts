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
import { and, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";

import { buildTranslationQaFindingHref } from "./finding-href";
import {
  buildQaFindingExternalRef,
  buildQaFindingIssueDescription,
  buildQaFindingIssueMetadata,
  buildQaFindingIssueTitle,
} from "./qa-finding-issue-bridge";
import { assertFindingsOnLatestSucceededRuns } from "./qa-report-store";

export type PromoteQaFindingResult = {
  findingId: string;
  issueId: string;
  identifier: string;
  created: boolean;
};

export async function promoteQaFindingsToIssues(input: {
  organizationId: string;
  organizationSlug: string;
  actorUserId: string;
  findingIds: string[];
  projectId?: string;
}): Promise<{ results: PromoteQaFindingResult[] }> {
  const uniqueFindingIds = [...new Set(input.findingIds)];
  if (uniqueFindingIds.length === 0) {
    return { results: [] };
  }

  const findings = await db
    .select()
    .from(schema.translationQaFindings)
    .where(
      and(
        eq(schema.translationQaFindings.organizationId, input.organizationId),
        inArray(schema.translationQaFindings.id, uniqueFindingIds),
      ),
    );

  if (findings.length !== uniqueFindingIds.length) {
    throw new Error("qa_finding_not_found");
  }
  if (input.projectId && findings.some((row) => row.projectId !== input.projectId)) {
    throw new Error("qa_finding_not_found");
  }

  await assertFindingsOnLatestSucceededRuns({
    organizationId: input.organizationId,
    findings: findings.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      runId: row.runId,
    })),
  });

  const service = new IssueSheetService();
  const results: PromoteQaFindingResult[] = [];

  for (const finding of findings) {
    const editorHref = buildTranslationQaFindingHref({
      organizationSlug: input.organizationSlug,
      projectId: finding.projectId,
      sourcePath: finding.sourcePath,
      targetLocale: finding.targetLocale,
      key: finding.key,
    });

    const externalRef = buildQaFindingExternalRef({
      projectId: finding.projectId,
      runId: finding.runId,
      findingKey: finding.key,
      checkType: finding.checkType,
      targetLocale: finding.targetLocale,
    });

    const existing = await db
      .select({
        id: schema.issueSheetIssues.id,
        identifier: schema.issueSheetIssues.identifier,
      })
      .from(schema.issueSheetIssues)
      .where(
        and(
          eq(schema.issueSheetIssues.organizationId, input.organizationId),
          eq(schema.issueSheetIssues.projectId, finding.projectId),
          eq(schema.issueSheetIssues.externalRef, externalRef),
        ),
      )
      .limit(1);

    if (existing[0]) {
      results.push({
        findingId: finding.id,
        issueId: existing[0].id,
        identifier: existing[0].identifier,
        created: false,
      });
      continue;
    }

    const issue = await service.createIssue({
      organizationId: input.organizationId,
      projectId: finding.projectId,
      actorUserId: input.actorUserId,
      metadata: buildQaFindingIssueMetadata({
        runId: finding.runId,
        findingId: finding.id,
        checkType: finding.checkType,
        severity: finding.severity,
        editorHref,
      }),
      body: {
        title: buildQaFindingIssueTitle({
          checkType: finding.checkType,
          findingKey: finding.key,
          targetLocale: finding.targetLocale,
        }),
        description: buildQaFindingIssueDescription({
          checkType: finding.checkType,
          message: finding.message,
          sourceText: finding.sourceText,
          targetText: finding.targetText,
          editorHref,
        }),
        issueType: "qa_failure",
        templateKey: "tpl_qa_failure",
        priority: finding.severity === "error" ? "P1" : "P2",
        targetLocale: finding.targetLocale,
        sourcePath: finding.sourcePath ?? undefined,
        segmentId: finding.key,
        translationKeyId: finding.translationKeyId ?? undefined,
        linkKind: "content_editor_segment",
        linkUrl: editorHref,
        externalRef,
      },
    });

    results.push({
      findingId: finding.id,
      issueId: issue.id,
      identifier: issue.identifier,
      created: true,
    });
  }

  return { results };
}
