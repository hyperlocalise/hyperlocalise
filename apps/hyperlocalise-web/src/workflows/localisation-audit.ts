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

  try {
    const prepared = await prepareLocalisationAuditStep({
      auditId: event.auditId,
      attemptNumber: event.attemptNumber,
    });
    if (!prepared.ok) {
      return { ...prepared, workflowRunId };
    }
    if (prepared.alreadyCompleted) {
      try {
        await queuePendingLocalisationAuditReportEmailsStep(prepared.auditId);
      } catch {
        return {
          ok: true,
          alreadyCompleted: true,
          auditId: prepared.auditId,
          workflowRunId,
          emailQueueFailed: true as const,
        };
      }
      return { ok: true, alreadyCompleted: true, auditId: prepared.auditId, workflowRunId };
    }
    if (prepared.staleAttempt) {
      return { ok: false, code: "stale_attempt", auditId: prepared.auditId, workflowRunId };
    }

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

    const analyzed = await analyzeLocalisationAuditStep({
      auditId: prepared.auditId,
      attemptNumber: prepared.attemptNumber,
      domainKey: prepared.domainKey,
      domainSlug: prepared.domainSlug,
      sourceUrl: prepared.sourceUrl,
      focusLocales: prepared.focusLocales,
      pages,
    });

    if (analyzed.ok) {
      // Email delivery must not overwrite a completed audit on transient queue failure.
      try {
        await queuePendingLocalisationAuditReportEmailsStep(prepared.auditId);
      } catch {
        return { ...analyzed, workflowRunId, emailQueueFailed: true as const };
      }
    }

    return { ...analyzed, workflowRunId };
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
}
