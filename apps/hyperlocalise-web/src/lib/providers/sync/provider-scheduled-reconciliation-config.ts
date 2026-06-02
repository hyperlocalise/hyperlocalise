export type ScheduledReconciliationSchedule = "incremental" | "resource_import" | "full" | "audit";

export type ScheduledReconciliationConfig = {
  incrementalIntervalMinutes: number;
  tmGlossaryIntervalMinutes: number;
  fullIntervalMinutes: number;
  auditIntervalMinutes: number;
  fullReconciliationHourUtc: number;
  auditHourUtc: number;
  maxIntentsPerTick: number;
};

export const DEFAULT_SCHEDULED_RECONCILIATION_CONFIG: ScheduledReconciliationConfig = {
  incrementalIntervalMinutes: 15,
  tmGlossaryIntervalMinutes: 60,
  fullIntervalMinutes: 24 * 60,
  auditIntervalMinutes: 24 * 60,
  fullReconciliationHourUtc: 3,
  auditHourUtc: 4,
  maxIntentsPerTick: 500,
};

export function resolveDueSchedules(input: {
  now: Date;
  config: Pick<
    ScheduledReconciliationConfig,
    | "incrementalIntervalMinutes"
    | "tmGlossaryIntervalMinutes"
    | "fullIntervalMinutes"
    | "auditIntervalMinutes"
    | "fullReconciliationHourUtc"
    | "auditHourUtc"
  >;
  forceSchedule?: ScheduledReconciliationSchedule;
}): ScheduledReconciliationSchedule[] {
  if (input.forceSchedule) {
    return [input.forceSchedule];
  }

  const minuteOfDay = input.now.getUTCHours() * 60 + input.now.getUTCMinutes();
  const schedules: ScheduledReconciliationSchedule[] = [];

  if (minuteOfDay % input.config.incrementalIntervalMinutes === 0) {
    schedules.push("incremental");
  }

  if (minuteOfDay % input.config.tmGlossaryIntervalMinutes === 0) {
    schedules.push("resource_import");
  }

  if (isDailyScheduleInterval(input.config.fullIntervalMinutes)) {
    if (
      input.now.getUTCHours() === input.config.fullReconciliationHourUtc &&
      input.now.getUTCMinutes() === 0
    ) {
      schedules.push("full");
    }
  } else if (minuteOfDay % input.config.fullIntervalMinutes === 0) {
    schedules.push("full");
  }

  if (isDailyScheduleInterval(input.config.auditIntervalMinutes)) {
    if (input.now.getUTCHours() === input.config.auditHourUtc && input.now.getUTCMinutes() === 0) {
      schedules.push("audit");
    }
  } else if (minuteOfDay % input.config.auditIntervalMinutes === 0) {
    schedules.push("audit");
  }

  return schedules;
}

function isDailyScheduleInterval(intervalMinutes: number) {
  return intervalMinutes >= 24 * 60;
}
