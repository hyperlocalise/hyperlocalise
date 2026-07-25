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
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import type {
  LocalisationAuditProgressStage,
  LocalisationAuditReport,
  LocalisationAuditTeaser,
} from "@/lib/localisation-audit/types";

import { LocalisationAuditResult } from "./localisation-audit-result";

type LocalisationAuditResultPageProps = {
  locale: string;
  domainSlug: string;
  audit: {
    id: string;
    domainKey: string;
    domainSlug: string;
    sourceUrl: string;
    status: string;
    attemptNumber?: number;
    progressStage?: LocalisationAuditProgressStage | null;
    score: number | null;
    teaser: LocalisationAuditTeaser | null;
    report: LocalisationAuditReport | null;
    unlocked: boolean;
    retryable?: boolean;
    errorCode: string | null;
    errorMessage?: string | null;
    completedAt?: string | null;
  };
};

export function LocalisationAuditResultPage({
  locale,
  domainSlug,
  audit,
}: LocalisationAuditResultPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl">
        <LocalisationAuditResult locale={locale} domainSlug={domainSlug} initialAudit={audit} />
        <MarketingFooter columns={footerColumns} />
      </div>
    </div>
  );
}
