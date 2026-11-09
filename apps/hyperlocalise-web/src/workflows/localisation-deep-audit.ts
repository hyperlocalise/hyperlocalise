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
import { getWorkflowMetadata } from "workflow";

import type { LocalisationDeepAuditEventData } from "@/lib/localisation-audit/deep/types";
import {
  LOCALISATION_DEEP_AUDIT_BATCH_SIZE,
  LOCALISATION_DEEP_AUDIT_BLOCKED_BATCH_SHARE,
} from "@/lib/localisation-audit/deep/types";

import {
  discoverDeepAuditStep,
  failDeepAuditStep,
  planDeepAuditAlternatesStep,
  prepareDeepAuditStep,
  renderDeepAuditBatchStep,
  scoreDeepAuditStep,
} from "./steps/localisation-deep-audit";

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : "deep audit failed";
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function localisationDeepAuditWorkflow(event: LocalisationDeepAuditEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  try {
    const prepared = await prepareDeepAuditStep({ runId: event.runId });
    if (!prepared.ok) {
      return { ...prepared, workflowRunId };
    }

    const discovered = await discoverDeepAuditStep({
      runId: event.runId,
      organizationId: prepared.organizationId,
      origin: prepared.origin,
      sourceUrl: prepared.sourceUrl,
      pageLimit: prepared.pageLimit,
    });
    if (!discovered.ok) {
      if (discovered.code === "cancelled") {
        return { ok: false, code: "cancelled", workflowRunId };
      }
      return {
        ...(await failDeepAuditStep({ runId: event.runId, errorCode: discovered.code })),
        workflowRunId,
      };
    }

    const attempted = [prepared.sourceUrl, ...discovered.urls];
    const alternates: string[] = [];
    let rendered = 1;
    let blockedStop = false;

    const renderAll = async (urls: string[]) => {
      for (const batch of chunk(urls, LOCALISATION_DEEP_AUDIT_BATCH_SIZE)) {
        const result = await renderDeepAuditBatchStep({
          runId: event.runId,
          organizationId: prepared.organizationId,
          urls: batch,
        });
        if (result.cancelled) return "cancelled" as const;
        rendered += result.rendered;
        alternates.push(...result.alternates);
        if (result.blocked / batch.length >= LOCALISATION_DEEP_AUDIT_BLOCKED_BATCH_SHARE) {
          blockedStop = true;
          return "blocked" as const;
        }
      }
      return "done" as const;
    };

    if ((await renderAll(discovered.urls)) === "cancelled") {
      return { ok: false, code: "cancelled", workflowRunId };
    }

    if (!blockedStop) {
      const second = await planDeepAuditAlternatesStep({
        origin: prepared.origin,
        alternates,
        attempted,
        remaining: prepared.pageLimit - attempted.length,
      });
      if ((await renderAll(second.urls)) === "cancelled") {
        return { ok: false, code: "cancelled", workflowRunId };
      }
    }

    const scored = await scoreDeepAuditStep({
      runId: event.runId,
      organizationId: prepared.organizationId,
      linkedDomainId: prepared.linkedDomainId,
      sitemap: discovered.sitemap,
    });
    return { ...scored, rendered, workflowRunId };
  } catch (error) {
    await failDeepAuditStep({
      runId: event.runId,
      errorCode: "deep_audit_failed",
      errorMessage: formatExecutionError(error),
    });
    return {
      ok: false,
      code: "deep_audit_failed",
      message: formatExecutionError(error),
      workflowRunId,
    };
  }
}
