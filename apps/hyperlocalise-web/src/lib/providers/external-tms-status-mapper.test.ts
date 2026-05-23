import { describe, expect, it } from "vite-plus/test";

import {
  mapProviderStatusToNormalized,
  type NormalizedJobStatus,
} from "./external-tms-status-mapper";

type ProviderCase = {
  provider: Parameters<typeof mapProviderStatusToNormalized>[0];
  status: string;
  expected: NormalizedJobStatus;
};

const cases: ProviderCase[] = [
  // Crowdin
  { provider: "crowdin", status: "todo", expected: "queued" },
  { provider: "crowdin", status: "new", expected: "queued" },
  { provider: "crowdin", status: "pending", expected: "queued" },
  { provider: "crowdin", status: "in_progress", expected: "running" },
  { provider: "crowdin", status: "in-progress", expected: "running" },
  { provider: "crowdin", status: "active", expected: "running" },
  { provider: "crowdin", status: "done", expected: "succeeded" },
  { provider: "crowdin", status: "closed", expected: "succeeded" },
  { provider: "crowdin", status: "completed", expected: "succeeded" },
  { provider: "crowdin", status: "failed", expected: "failed" },
  { provider: "crowdin", status: "rejected", expected: "failed" },
  { provider: "crowdin", status: "waiting_for_review", expected: "waiting_for_review" },
  { provider: "crowdin", status: "in_review", expected: "waiting_for_review" },
  { provider: "crowdin", status: "cancelled", expected: "cancelled" },
  { provider: "crowdin", status: "canceled", expected: "cancelled" },
  { provider: "crowdin", status: "unknown_custom_status", expected: "queued" },

  // Smartling
  { provider: "smartling", status: "AWAITING_AUTHORIZATION", expected: "queued" },
  { provider: "smartling", status: "In Translation", expected: "running" },
  { provider: "smartling", status: "COMPLETED", expected: "succeeded" },
  { provider: "smartling", status: "CANCELLED", expected: "cancelled" },
  { provider: "smartling", status: "In Review", expected: "waiting_for_review" },

  // Phrase
  { provider: "phrase", status: "new", expected: "queued" },
  { provider: "phrase", status: "unclaimed", expected: "queued" },
  { provider: "phrase", status: "in_translation", expected: "running" },
  { provider: "phrase", status: "accepted", expected: "running" },
  { provider: "phrase", status: "completed", expected: "succeeded" },
  { provider: "phrase", status: "delivered", expected: "succeeded" },
  { provider: "phrase", status: "emailed", expected: "succeeded" },
  { provider: "phrase", status: "ACCEPTED", expected: "running" },
  { provider: "phrase", status: "DECLINED", expected: "failed" },
  { provider: "phrase", status: "rejected", expected: "failed" },
  { provider: "phrase", status: "review", expected: "waiting_for_review" },
  { provider: "phrase", status: "cancelled", expected: "cancelled" },

  // Lokalise
  { provider: "lokalise", status: "created", expected: "queued" },
  { provider: "lokalise", status: "queued", expected: "queued" },
  { provider: "lokalise", status: "unassigned", expected: "queued" },
  { provider: "lokalise", status: "in_progress", expected: "running" },
  { provider: "lokalise", status: "in_translation", expected: "running" },
  { provider: "lokalise", status: "completed", expected: "succeeded" },
  { provider: "lokalise", status: "failed", expected: "failed" },
  { provider: "lokalise", status: "reviewing", expected: "waiting_for_review" },
  { provider: "lokalise", status: "skipped", expected: "cancelled" },
];

describe("mapProviderStatusToNormalized", () => {
  it.each(cases)("maps $provider/$status to $expected", ({ provider, status, expected }) => {
    expect(mapProviderStatusToNormalized(provider, status)).toBe(expected);
  });

  it("defaults unknown providers to queued", () => {
    expect(mapProviderStatusToNormalized("crowdin" as never, "completely_unknown")).toBe("queued");
  });
});
