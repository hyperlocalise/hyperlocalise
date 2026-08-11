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

import type { LocalisationAuditEventData } from "@/lib/localisation-audit/types";

import {
  analyzeLocalisationAuditStep,
  crawlLocalisationAuditStep,
  failLocalisationAuditStep,
  prepareLocalisationAuditStep,
  queuePendingLocalisationAuditReportEmailsStep,
  setLocalisationAuditProgressStep,
} from "./steps/localisation-audit";

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : "localisation audit failed";
}

export async function localisationAuditWorkflow(event: LocalisationAuditEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  // Keep audit completion separate from report-email queueing so a transient
  // enqueue failure can retry without marking a succeeded audit failed.
  let completedAuditId: string | null = null;
  let alreadyCompleted = false;
  let analyzedResult: Awaited<ReturnType<typeof analyzeLocalisationAuditStep>> | null = null;

  try {
    const prepared = await prepareLocalisationAuditStep({
      auditId: event.auditId,
      attemptNumber: event.attemptNumber,
    });
    if (!prepared.ok) {
      return { ...prepared, workflowRunId };
    }
    if (prepared.alreadyCompleted) {
      completedAuditId = prepared.auditId;
      alreadyCompleted = true;
    } else if (prepared.staleAttempt) {
      return { ok: false, code: "stale_attempt", auditId: prepared.auditId, workflowRunId };
    } else {
      await setLocalisationAuditProgressStep({
        auditId: prepared.auditId,
        attemptNumber: prepared.attemptNumber,
        progressStage: "crawling",
      });

      const pages = await crawlLocalisationAuditStep({
        origin: prepared.origin,
        sourceUrl: prepared.sourceUrl,
      });

      await setLocalisationAuditProgressStep({
        auditId: prepared.auditId,
        attemptNumber: prepared.attemptNumber,
        progressStage: "analyzing",
      });

      analyzedResult = await analyzeLocalisationAuditStep({
        auditId: prepared.auditId,
        attemptNumber: prepared.attemptNumber,
        domainKey: prepared.domainKey,
        domainSlug: prepared.domainSlug,
        sourceUrl: prepared.sourceUrl,
        focusLocales: prepared.focusLocales,
        pages,
      });

      if (!analyzedResult.ok) {
        return { ...analyzedResult, workflowRunId };
      }
      completedAuditId = prepared.auditId;
    }
  } catch (error) {
    await failLocalisationAuditStep({
      auditId: event.auditId,
      attemptNumber: event.attemptNumber,
      errorCode: "localisation_audit_failed",
      errorMessage: formatExecutionError(error),
    });
    return {
      ok: false,
      code: "localisation_audit_failed",
      message: formatExecutionError(error),
      workflowRunId,
    };
  }

  if (completedAuditId) {
    // Let step/workflow retries re-drive pending leads. Do not swallow failures.
    await queuePendingLocalisationAuditReportEmailsStep(completedAuditId);
    if (alreadyCompleted) {
      return { ok: true, alreadyCompleted: true, auditId: completedAuditId, workflowRunId };
    }
    return { ...analyzedResult!, workflowRunId };
  }

  return { ok: false, code: "localisation_audit_failed", workflowRunId };
}
