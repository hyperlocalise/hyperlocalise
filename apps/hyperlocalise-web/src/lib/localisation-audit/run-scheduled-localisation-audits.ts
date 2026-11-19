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
import { createLogger } from "@/lib/log";
import { serializeErrorForLog } from "@/lib/serialize-error-for-log";
import { isErr } from "@/lib/primitives/result/results";
import { assertResolvablePublicHttpUrl } from "@/lib/security/public-http-fetch";
import type { LocalisationAuditQueue } from "@/lib/workflow/types";

import { LocalisationAuditDailyQuotaExceededError } from "./daily-quota";
import { resolveDomainIdentity, type DomainIdentity } from "./domain-slug";
import {
  SCHEDULED_LOCALISATION_AUDIT_SITES,
  type ScheduledLocalisationAuditSite,
} from "./scheduled-audit-sites";
import {
  attachLocalisationAuditWorkflowRun,
  claimOrReuseLocalisationAudit,
  failLocalisationAudit,
  isLocalisationAuditClaimable,
  listLocalisationAuditsByDomainKeys,
} from "./store";

const logger = createLogger("scheduled-localisation-audits");

export type ScheduledLocalisationAuditResults = {
  eligible: number;
  started: number;
  reused: number;
  failed: number;
  quotaExceeded: boolean;
};

type ResolvedSite = ScheduledLocalisationAuditSite & { identity: DomainIdentity };

/**
 * Sites without an audit come first, then the ones audited longest ago.
 * Sites with an active run or a report from the last 24h are skipped.
 */
async function pickDueSites(
  sites: readonly ScheduledLocalisationAuditSite[],
  limit: number,
): Promise<{ eligible: number; due: ResolvedSite[] }> {
  const resolved: ResolvedSite[] = [];
  for (const site of sites) {
    const identity = resolveDomainIdentity(site.url);
    if (isErr(identity)) {
      logger.warn({ url: site.url, code: identity.error.code }, "skipping invalid scheduled site");
      continue;
    }
    resolved.push({ ...site, identity: identity.value });
  }

  const audits = await listLocalisationAuditsByDomainKeys(
    resolved.map((site) => site.identity.domainKey),
  );
  const auditsByKey = new Map(audits.map((audit) => [audit.domainKey, audit]));

  const eligible = resolved
    .map((site, index) => ({ site, index, audit: auditsByKey.get(site.identity.domainKey) }))
    .filter(({ audit }) => audit == null || isLocalisationAuditClaimable(audit))
    .sort((a, b) => {
      const aTime = a.audit?.lastAttemptAt?.getTime() ?? -1;
      const bTime = b.audit?.lastAttemptAt?.getTime() ?? -1;
      return aTime - bTime || a.index - b.index;
    });

  return { eligible: eligible.length, due: eligible.slice(0, limit).map(({ site }) => site) };
}

export async function runScheduledLocalisationAudits(input: {
  limit: number;
  queue: LocalisationAuditQueue;
  sites?: readonly ScheduledLocalisationAuditSite[];
}): Promise<ScheduledLocalisationAuditResults> {
  const { eligible, due } = await pickDueSites(
    input.sites ?? SCHEDULED_LOCALISATION_AUDIT_SITES,
    input.limit,
  );
  const results: ScheduledLocalisationAuditResults = {
    eligible,
    started: 0,
    reused: 0,
    failed: 0,
    quotaExceeded: false,
  };

  for (const site of due) {
    const { identity } = site;
    const resolvable = await assertResolvablePublicHttpUrl(identity.sourceUrl);
    if (isErr(resolvable)) {
      logger.warn({ url: identity.sourceUrl, code: resolvable.error.code }, "site not resolvable");
      results.failed += 1;
      continue;
    }

    let claim;
    try {
      claim = await claimOrReuseLocalisationAudit({
        domainKey: identity.domainKey,
        domainSlug: identity.domainSlug,
        sourceUrl: identity.sourceUrl,
        focusLocales: [],
        runSource: "scheduled",
      });
    } catch (error) {
      if (error instanceof LocalisationAuditDailyQuotaExceededError) {
        results.quotaExceeded = true;
        break;
      }
      logger.error(
        { err: serializeErrorForLog(error), url: identity.sourceUrl },
        "could not claim scheduled audit",
      );
      results.failed += 1;
      continue;
    }

    if (claim.outcome === "reused_success" || claim.outcome === "reused_active") {
      results.reused += 1;
      continue;
    }

    try {
      const enqueued = await input.queue.enqueue({
        auditId: claim.audit.id,
        attemptNumber: claim.audit.attemptNumber,
      });
      const workflowRunId = enqueued.ids[0];
      if (workflowRunId) {
        await attachLocalisationAuditWorkflowRun({
          auditId: claim.audit.id,
          attemptNumber: claim.audit.attemptNumber,
          workflowRunId,
        });
      }
      results.started += 1;
    } catch (error) {
      logger.error(
        { err: serializeErrorForLog(error), url: identity.sourceUrl },
        "could not enqueue scheduled audit",
      );
      await failLocalisationAudit({
        auditId: claim.audit.id,
        attemptNumber: claim.audit.attemptNumber,
        errorCode: "localisation_audit_enqueue_failed",
        errorMessage: "Audit could not be queued. You can retry shortly.",
      });
      results.failed += 1;
    }
  }

  return results;
}
