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
import type {
  LocalisationAuditDeliverEventData,
  LocalisationAuditPrepareEventData,
  LocalisationAuditRunEventData,
} from "@/lib/workflow/types";

export async function prepareLocalisationAuditStep(event: LocalisationAuditPrepareEventData) {
  "use step";
  const { isErr } = await import("@/lib/primitives/result/results");
  const { isFatalPrepareError, prepareAuditWork } =
    await import("@/lib/localisation-audit/prepare-audit-work");
  const result = await prepareAuditWork(event.auditId);
  if (!isErr(result)) {
    return { ok: true as const, audit: result.value };
  }
  return {
    ok: false as const,
    code: result.error.code,
    message: result.error.message,
    fatal: isFatalPrepareError(result.error.code),
  };
}

export async function runLocalisationAuditStep(event: LocalisationAuditRunEventData) {
  "use step";
  const { isErr } = await import("@/lib/primitives/result/results");
  const { runAuditWork } = await import("@/lib/localisation-audit/run-audit-work");
  const result = await runAuditWork(event.auditId);
  if (!isErr(result)) {
    return { ok: true as const, audit: result.value };
  }
  const { markAuditFailed } = await import("@/lib/localisation-audit/operations");
  const { db } = await import("@/lib/database");
  await markAuditFailed(db, event.auditId, result.error.code);
  return {
    ok: false as const,
    code: result.error.code,
    message: result.error.message,
    fatal: true,
  };
}

export async function deliverLocalisationAuditReportStep(event: LocalisationAuditDeliverEventData) {
  "use step";
  const { isErr } = await import("@/lib/primitives/result/results");
  const { deliverAuditReportWork } =
    await import("@/lib/localisation-audit/deliver-audit-report-work");
  const result = await deliverAuditReportWork(event);
  if (!isErr(result)) {
    return { ok: true as const, delivery: result.value };
  }
  return {
    ok: false as const,
    code: result.error.code,
    message: result.error.message,
    fatal: result.error.code !== "audit_email_delivery_failed",
  };
}
