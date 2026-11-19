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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { LocalisationAuditDailyQuotaExceededError } from "./daily-quota";
import { resolveDomainIdentity } from "./domain-slug";
import type { LocalisationAuditRow } from "./store";

const storeMocks = vi.hoisted(() => ({
  listLocalisationAuditsByDomainKeys: vi.fn(),
  claimOrReuseLocalisationAudit: vi.fn(),
  attachLocalisationAuditWorkflowRun: vi.fn(),
  failLocalisationAudit: vi.fn(),
  isLocalisationAuditClaimable: vi.fn(),
}));

vi.mock("./store", () => storeMocks);
vi.mock("@/lib/security/public-http-fetch", () => ({
  assertResolvablePublicHttpUrl: vi.fn(async (url: string) => ({ ok: true, value: url })),
}));

const { runScheduledLocalisationAudits } = await import("./run-scheduled-localisation-audits");

const sites = [
  { name: "A", url: "https://a.example/", category: "Test" },
  { name: "B", url: "https://b.example/", category: "Test" },
  { name: "C", url: "https://c.example/", category: "Test" },
  { name: "D", url: "https://d.example/", category: "Test" },
];

function domainKey(url: string) {
  const identity = resolveDomainIdentity(url);
  if (!identity.ok) throw new Error("invalid test url");
  return identity.value.domainKey;
}

function auditRow(input: {
  url: string;
  lastAttemptAt: Date;
  claimable?: boolean;
}): LocalisationAuditRow & { claimable: boolean } {
  return {
    id: `audit-${input.url}`,
    domainKey: domainKey(input.url),
    lastAttemptAt: input.lastAttemptAt,
    claimable: input.claimable ?? true,
  } as LocalisationAuditRow & { claimable: boolean };
}

function createQueue() {
  return { enqueue: vi.fn(async () => ({ ids: ["run-1"] })) };
}

describe("runScheduledLocalisationAudits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.isLocalisationAuditClaimable.mockImplementation(
      (audit: { claimable: boolean }) => audit.claimable,
    );
    storeMocks.claimOrReuseLocalisationAudit.mockImplementation(
      async (input: { domainKey: string }) => ({
        audit: { id: `audit-${input.domainKey}`, attemptNumber: 1 },
        outcome: "created",
      }),
    );
  });

  it("starts unaudited sites first, then the oldest, and skips unclaimable ones", async () => {
    storeMocks.listLocalisationAuditsByDomainKeys.mockResolvedValue([
      auditRow({ url: sites[0].url, lastAttemptAt: new Date("2026-11-10T00:00:00Z") }),
      auditRow({ url: sites[1].url, lastAttemptAt: new Date("2026-11-01T00:00:00Z") }),
      auditRow({
        url: sites[2].url,
        lastAttemptAt: new Date("2026-10-01T00:00:00Z"),
        claimable: false,
      }),
    ]);
    const queue = createQueue();

    const results = await runScheduledLocalisationAudits({ limit: 2, queue, sites });

    expect(results).toEqual({
      eligible: 3,
      started: 2,
      reused: 0,
      failed: 0,
      quotaExceeded: false,
    });
    const claimedKeys = storeMocks.claimOrReuseLocalisationAudit.mock.calls.map(
      ([input]) => input.domainKey,
    );
    expect(claimedKeys).toEqual([domainKey(sites[3].url), domainKey(sites[1].url)]);
    expect(storeMocks.claimOrReuseLocalisationAudit).toHaveBeenCalledWith(
      expect.objectContaining({ runSource: "scheduled", focusLocales: [] }),
    );
    expect(storeMocks.attachLocalisationAuditWorkflowRun).toHaveBeenCalledTimes(2);
  });

  it("stops when the scheduled quota is exhausted", async () => {
    storeMocks.listLocalisationAuditsByDomainKeys.mockResolvedValue([]);
    storeMocks.claimOrReuseLocalisationAudit
      .mockResolvedValueOnce({ audit: { id: "audit-a", attemptNumber: 1 }, outcome: "created" })
      .mockRejectedValueOnce(new LocalisationAuditDailyQuotaExceededError("scheduled", 1));

    const results = await runScheduledLocalisationAudits({
      limit: 4,
      queue: createQueue(),
      sites,
    });

    expect(results).toMatchObject({ started: 1, quotaExceeded: true });
    expect(storeMocks.claimOrReuseLocalisationAudit).toHaveBeenCalledTimes(2);
  });

  it("marks the audit failed when it cannot be enqueued", async () => {
    storeMocks.listLocalisationAuditsByDomainKeys.mockResolvedValue([]);
    const queue = { enqueue: vi.fn(async () => Promise.reject(new Error("queue down"))) };

    const results = await runScheduledLocalisationAudits({
      limit: 1,
      queue,
      sites,
    });

    expect(results).toMatchObject({ started: 0, failed: 1 });
    expect(storeMocks.failLocalisationAudit).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "localisation_audit_enqueue_failed" }),
    );
  });
});
