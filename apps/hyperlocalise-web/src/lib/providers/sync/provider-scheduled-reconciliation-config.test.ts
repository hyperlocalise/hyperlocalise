import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_SCHEDULED_RECONCILIATION_CONFIG,
  resolveDueSchedules,
} from "./provider-scheduled-reconciliation-config";

describe("resolveDueSchedules", () => {
  const config = DEFAULT_SCHEDULED_RECONCILIATION_CONFIG;

  it("returns incremental scans every 15 minutes", () => {
    const schedules = resolveDueSchedules({
      now: new Date("2026-05-28T10:15:00.000Z"),
      config,
    });

    expect(schedules).toEqual(["incremental"]);
  });

  it("includes resource import scans on hourly boundaries", () => {
    const schedules = resolveDueSchedules({
      now: new Date("2026-05-28T11:00:00.000Z"),
      config,
    });

    expect(schedules).toEqual(["incremental", "resource_import"]);
  });

  it("includes full reconciliation at the configured nightly hour", () => {
    const schedules = resolveDueSchedules({
      now: new Date("2026-05-28T03:00:00.000Z"),
      config,
    });

    expect(schedules).toEqual(["incremental", "resource_import", "full"]);
  });

  it("includes daily audits at the configured audit hour", () => {
    const schedules = resolveDueSchedules({
      now: new Date("2026-05-28T04:00:00.000Z"),
      config,
    });

    expect(schedules).toEqual(["incremental", "resource_import", "audit"]);
  });

  it("honors forced schedule overrides", () => {
    const schedules = resolveDueSchedules({
      now: new Date("2026-05-28T10:07:00.000Z"),
      config,
      forceSchedule: "full",
    });

    expect(schedules).toEqual(["full"]);
  });
});
