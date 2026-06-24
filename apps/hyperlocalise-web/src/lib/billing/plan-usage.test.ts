import { describe, expect, it } from "vite-plus/test";

import {
  buildAvailablePlansHref,
  buildPlanUsageHref,
  formatCompactUsageValue,
  formatPrimaryUsageSummary,
  getUsageProgressPercent,
  hasPlanUsageMeter,
  isPlanUsageBillingPath,
  resolveActivePlanName,
  resolvePlanUsageSummary,
  resolveUsageDisplayBalance,
} from "@/lib/billing/plan-usage";

describe("plan usage helpers", () => {
  it("builds billing usage links and detects billing routes", () => {
    expect(buildPlanUsageHref("acme")).toBe("/org/acme/settings/billing#plan-usage");
    expect(buildAvailablePlansHref("acme")).toBe("/org/acme/settings/billing#available-plans");
    expect(isPlanUsageBillingPath("/org/acme/settings/billing", "acme")).toBe(true);
    expect(isPlanUsageBillingPath("/en/org/acme/settings/billing", "acme")).toBe(true);
    expect(isPlanUsageBillingPath("/org/acme/dashboard", "acme")).toBe(false);
  });

  it("resolves plan names from subscription, plan list, or plan id", () => {
    expect(
      resolveActivePlanName({
        activePlanId: "enterprise",
        activeSubscriptionPlanName: "Enterprise",
        plans: [{ id: "growth", name: "Growth" }],
      }),
    ).toBe("Enterprise");

    expect(
      resolveActivePlanName({
        activePlanId: "growth",
        activeSubscriptionPlanName: null,
        plans: [{ id: "growth", name: "Growth" }],
      }),
    ).toBe("Growth");

    expect(
      resolveActivePlanName({
        activePlanId: "enterprise",
        activeSubscriptionPlanName: null,
        plans: [],
      }),
    ).toBe("Enterprise");
  });

  it("formats compact usage values", () => {
    expect(formatCompactUsageValue(1_200_000)).toMatch(/1\.2M|1,2M/);
    expect(formatCompactUsageValue(2_000_000)).toMatch(/2M/);
  });

  it("computes usage progress and summary copy", () => {
    expect(getUsageProgressPercent({ usage: 1_200_000, granted: 2_000_000 })).toBe(60);
    expect(formatPrimaryUsageSummary({ usage: 1_200_000, granted: 2_000_000 })).toMatch(
      /1\.2M.*2M.*words used/,
    );
  });

  it("builds a plan usage summary from Autumn customer data", () => {
    const summary = resolvePlanUsageSummary({
      subscriptions: [
        {
          planId: "enterprise",
          status: "active",
          currentPeriodEnd: Date.parse("2027-08-24T00:00:00.000Z"),
        },
      ],
      balances: {
        ai_tokens: {
          usage: 1_200_000,
          granted: 2_000_000,
          remaining: 800_000,
        },
      },
      plans: [{ id: "enterprise", name: "Enterprise" }],
    });

    expect(summary.activePlanName).toBe("Enterprise");
    expect(summary.renewalCopy).toMatch(/^Renews on /);
    expect(summary.renewalLabel).toContain("2027");
    expect(summary.usageProgressPercent).toBe(60);
    expect(summary.usageSummary).toMatch(/words used/);

    const cancelingSummary = resolvePlanUsageSummary({
      subscriptions: [
        {
          planId: "enterprise",
          status: "active",
          canceledAt: Date.now(),
          currentPeriodEnd: Date.parse("2027-08-24T00:00:00.000Z"),
        },
      ],
      balances: {
        ai_tokens: {
          usage: 1_200_000,
          granted: 2_000_000,
          remaining: 800_000,
        },
      },
      plans: [{ id: "enterprise", name: "Enterprise" }],
    });

    expect(cancelingSummary.renewalCopy).toMatch(/^Access until /);
  });

  it("detects when a usage meter is available", () => {
    expect(
      hasPlanUsageMeter({
        activePlanName: "Growth",
        isScheduledForCancel: false,
        renewalLabel: null,
        renewalCopy: null,
        usageSummary: "0 / 0 words used",
        usageProgressPercent: null,
        unlimited: false,
      }),
    ).toBe(false);

    expect(
      hasPlanUsageMeter({
        activePlanName: "Enterprise",
        isScheduledForCancel: false,
        renewalLabel: "Aug 24, 2027",
        renewalCopy: "Renews on Aug 24, 2027",
        usageSummary: "1.2M / 2M words used",
        usageProgressPercent: 60,
        unlimited: false,
      }),
    ).toBe(true);
  });

  it("uses local workspace resource usage when provided", () => {
    expect(
      resolveUsageDisplayBalance({
        balance: {
          usage: 0,
          remaining: 1,
          granted: 1,
          unlimited: false,
          nextResetAt: 1_812_601_600_000,
        },
        localUsage: 1,
      }),
    ).toEqual({
      usage: 1,
      remaining: 0,
      granted: 1,
      unlimited: false,
      nextResetAt: 1_812_601_600_000,
    });
  });

  it("preserves Autumn remaining balance when local usage is unavailable", () => {
    expect(
      resolveUsageDisplayBalance({
        balance: {
          usage: 0,
          remaining: 1,
          granted: 1,
          unlimited: false,
          nextResetAt: null,
        },
      }),
    ).toMatchObject({
      usage: 0,
      remaining: 1,
      granted: 1,
    });
  });
});
