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
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isErr } from "@/lib/primitives/result/results";

import type { LinearClient } from "./client";
import type { LinearApiError } from "./types";

const LINEAR_ISSUE_CREATE_CONCURRENCY = 3;
const LINEAR_ISSUE_TITLE_MAX_CHARS = 200;
const LINEAR_ISSUE_TEXT_MAX_CHARS = 2_000;

/** Linear priorities: 2 is High, 3 is Medium. */
const LINEAR_PRIORITY_BY_SEVERITY: Record<string, number> = {
  error: 2,
  warning: 3,
};

export type LinearQaFinding = {
  id: string;
  projectId: string;
  projectName: string;
  sourcePath: string | null;
  key: string;
  targetLocale: string;
  checkType: string;
  severity: string;
  message: string;
  sourceText: string;
  targetText: string;
};

export type LinearQaFindingIssueResult =
  | { findingId: string; ok: true; identifier: string; url: string }
  | { findingId: string; ok: false; code: LinearApiError["code"] };

function truncate(value: string, maxChars: number) {
  return value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value;
}

/** Keeps translated text from closing the fence it is quoted in. */
function fence(value: string) {
  return ["```", truncate(value, LINEAR_ISSUE_TEXT_MAX_CHARS).replaceAll("```", "ʼʼʼ"), "```"].join(
    "\n",
  );
}

function humanizeCheckType(checkType: string) {
  const words = checkType.replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function buildLinearQaFindingIssue(input: {
  finding: LinearQaFinding;
  /** Link to the project's QA page, when the app's public address is known. */
  qaPageUrl: string | null;
}) {
  const { finding } = input;
  const title = truncate(
    `${humanizeCheckType(finding.checkType)} in ${finding.targetLocale}: ${finding.key}`,
    LINEAR_ISSUE_TITLE_MAX_CHARS,
  );
  const location = finding.sourcePath ? `\`${finding.sourcePath}\` · ` : "";
  const lines = [
    truncate(finding.message, LINEAR_ISSUE_TEXT_MAX_CHARS),
    "",
    `**Project:** ${finding.projectName}`,
    `**String:** ${location}\`${finding.key}\``,
    `**Language:** ${finding.targetLocale}`,
    `**Severity:** ${finding.severity}`,
    "",
    "**Source**",
    fence(finding.sourceText),
    "",
    "**Translation**",
    fence(finding.targetText),
  ];
  if (input.qaPageUrl) {
    lines.push("", `[Open QA in Hyperlocalise](${input.qaPageUrl})`);
  }

  return {
    title,
    description: lines.join("\n"),
    priority: LINEAR_PRIORITY_BY_SEVERITY[finding.severity],
  };
}

/** The open findings among `findingIds` that belong to the organization, with their project names. */
export async function loadLinearQaFindings(input: {
  organizationId: string;
  findingIds: readonly string[];
}): Promise<LinearQaFinding[]> {
  if (input.findingIds.length === 0) {
    return [];
  }

  return db
    .select({
      id: schema.translationQaFindings.id,
      projectId: schema.translationQaFindings.projectId,
      projectName: schema.projects.name,
      sourcePath: schema.translationQaFindings.sourcePath,
      key: schema.translationQaFindings.key,
      targetLocale: schema.translationQaFindings.targetLocale,
      checkType: schema.translationQaFindings.checkType,
      severity: schema.translationQaFindings.severity,
      message: schema.translationQaFindings.message,
      sourceText: schema.translationQaFindings.sourceText,
      targetText: schema.translationQaFindings.targetText,
    })
    .from(schema.translationQaFindings)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.translationQaFindings.projectId))
    .where(
      and(
        eq(schema.translationQaFindings.organizationId, input.organizationId),
        eq(schema.translationQaFindings.status, "open"),
        inArray(schema.translationQaFindings.id, [...input.findingIds]),
      ),
    );
}

/** Files one Linear issue per finding. A failure for one finding does not stop the others. */
export async function createLinearIssuesForQaFindings(input: {
  client: LinearClient;
  teamId: string;
  findings: readonly LinearQaFinding[];
  qaPageUrl: (finding: LinearQaFinding) => string | null;
}): Promise<LinearQaFindingIssueResult[]> {
  return mapWithConcurrency(
    [...input.findings],
    LINEAR_ISSUE_CREATE_CONCURRENCY,
    async (finding): Promise<LinearQaFindingIssueResult> => {
      const issue = buildLinearQaFindingIssue({ finding, qaPageUrl: input.qaPageUrl(finding) });
      const created = await input.client.createIssue({ teamId: input.teamId, ...issue });
      if (isErr(created)) {
        return { findingId: finding.id, ok: false, code: created.error.code };
      }
      return {
        findingId: finding.id,
        ok: true,
        identifier: created.value.identifier,
        url: created.value.url,
      };
    },
  );
}
