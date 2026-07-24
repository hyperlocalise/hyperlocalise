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
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { verifyPrivateReportAccessToken } from "./access-token";
import type { LocalisationAuditError, PrivateAuditReport, PublicAuditReport } from "./types";

export async function loadPublicLocalisationAuditReportBySlug(
  slug: string,
): Promise<PublicAuditReport | null> {
  const [report] = await db
    .select({ publicReport: schema.localisationAuditReports.publicReport })
    .from(schema.localisationAuditReports)
    .where(
      and(
        eq(schema.localisationAuditReports.publicSlug, slug),
        eq(schema.localisationAuditReports.visibility, "public"),
      ),
    )
    .limit(1);
  return report?.publicReport ?? null;
}

export async function loadPrivateLocalisationAuditReportByToken(
  token: string,
): Promise<Result<PrivateAuditReport, LocalisationAuditError>> {
  const secret = env.LOCALISATION_AUDIT_ACCESS_SECRET;
  if (!secret) {
    return err({
      code: "audit_access_not_configured",
      message: "Private report access is not configured.",
    });
  }
  const tokenResult = verifyPrivateReportAccessToken({ token, secret });
  if (isErr(tokenResult)) {
    return tokenResult;
  }

  const [report] = await db
    .select({ privateReport: schema.localisationAuditReports.privateReport })
    .from(schema.localisationAuditReports)
    .where(
      and(
        eq(schema.localisationAuditReports.id, tokenResult.value.reportId),
        eq(schema.localisationAuditReports.auditId, tokenResult.value.auditId),
      ),
    )
    .limit(1);
  if (!report) {
    return err({ code: "report_not_found", message: "The report was not found." });
  }
  return ok(report.privateReport);
}
