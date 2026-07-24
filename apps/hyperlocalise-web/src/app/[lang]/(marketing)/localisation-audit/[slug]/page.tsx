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
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicAuditReportBySlug } from "@/lib/localisation-audit/service";

import { AuditReportView } from "../_components/audit-report-view";
import { toAuditReportProjection } from "../_components/localisation-audit-types";

export const metadata: Metadata = {
  title: "Shared Localisation Health Report | Hyperlocalise",
  description:
    "A shareable summary of a website's technical localisation readiness, linguistic quality, and market experience.",
  robots: {
    index: false,
    follow: false,
  },
};

type PublicAuditReportPageProps = {
  params: Promise<{ lang: string; slug: string }>;
};

export default async function PublicAuditReportPage({ params }: PublicAuditReportPageProps) {
  const { slug } = await params;
  const serviceReport = await getPublicAuditReportBySlug(slug);
  if (!serviceReport) {
    notFound();
  }

  const report = toAuditReportProjection(serviceReport);
  return <AuditReportView report={report} mode="public" showFooter />;
}
