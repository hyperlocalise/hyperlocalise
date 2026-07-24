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
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { fetchAuditPage } from "./fetch-page";
import {
  getAuditRecord,
  markAuditFailed,
  safeAuditFromRecord,
  toPersistedExtraction,
} from "./operations";
import { discoverLocaleAlternatives } from "./parser";
import type { LocalisationAuditError, SafeAudit } from "./types";

const FATAL_PREPARE_CODES = new Set<LocalisationAuditError["code"]>([
  "invalid_audit_url",
  "audit_url_not_public",
  "audit_response_not_html",
  "audit_response_too_large",
]);

export function isFatalPrepareError(code: LocalisationAuditError["code"]): boolean {
  return FATAL_PREPARE_CODES.has(code);
}

export async function prepareAuditWork(
  auditId: string,
): Promise<Result<SafeAudit, LocalisationAuditError>> {
  const audit = await getAuditRecord(db, auditId);
  if (!audit) {
    return err({ code: "audit_not_found", message: "The audit was not found." });
  }
  if (audit.status !== "preparing") {
    // Idempotent replays after success or terminal failure complete without re-fetching.
    return ok(safeAuditFromRecord(audit));
  }

  const pageResult = await fetchAuditPage(audit.normalizedUrl, { isPrimary: true });
  if (isErr(pageResult)) {
    await markAuditFailed(db, audit.id, pageResult.error.code);
    return pageResult;
  }
  if (pageResult.value.status !== "extracted") {
    await markAuditFailed(db, audit.id, "audit_fetch_failed");
    return err({
      code: "audit_fetch_failed",
      message: "The submitted page could not be extracted.",
    });
  }

  const page = pageResult.value;
  const alternatives = discoverLocaleAlternatives(page.extracted);
  const preparedAudit = await db.transaction(async (tx) => {
    const [updatedAudit] = await tx
      .update(schema.localisationAudits)
      .set({
        status: "awaiting_confirmation",
        detectedLocale: page.extracted.htmlLang,
        alternatives,
        failureCode: null,
      })
      .where(eq(schema.localisationAudits.id, audit.id))
      .returning();
    if (!updatedAudit) {
      throw new Error("Failed to prepare localisation audit.");
    }
    await tx.insert(schema.localisationAuditPages).values({
      auditId: audit.id,
      normalizedUrl: page.url,
      locale: page.extracted.htmlLang,
      isPrimary: true,
      status: "extracted",
      httpStatus: page.httpStatus,
      contentFingerprint: page.extracted.contentFingerprint,
      extraction: toPersistedExtraction(page.extracted),
      fetchedAt: new Date(),
    });
    await tx.insert(schema.localisationAuditEvents).values({
      auditId: audit.id,
      eventType: "prepared",
      metadata: { localeCount: alternatives.length + 1 },
    });
    return updatedAudit;
  });

  return ok(safeAuditFromRecord(preparedAudit));
}
