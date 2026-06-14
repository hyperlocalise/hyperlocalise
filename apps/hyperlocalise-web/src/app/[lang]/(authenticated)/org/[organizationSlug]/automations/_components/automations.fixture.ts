import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automations";

const fixedNow = "2026-06-07T12:00:00.000Z";

const disabledContentfulToolConfig = {
  enabled: false,
  sourceLocale: "en",
  contentTypeIds: [],
  targetLocales: [],
  fieldMode: "auto" as const,
  overwriteDraftLocales: false,
  runQa: true,
  writeDrafts: true,
};

export function createAutomationSummary(
  overrides: Partial<WorkspaceAutomationRecord> = {},
): WorkspaceAutomationRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "org_001",
    authorUserId: "user_001",
    status: "active",
    name: "Validate localisation on push",
    instructions: "Validate source and translation changes on every push.",
    triggerConfig: {
      mode: "github",
      branches: ["main"],
    },
    repositoryTarget: {
      kind: "github",
      githubInstallationRepositoryId: "22222222-2222-4222-8222-222222222222",
    },
    toolConfig: {
      github: {
        enabled: true,
        pushSource: false,
        pullTranslations: false,
        validation: true,
      },
      slack: {
        enabled: true,
        channelId: "C01234567",
      },
      email: {
        enabled: false,
      },
      contentful: disabledContentfulToolConfig,
    },
    configVersion: 1,
    nextRunAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides,
  };
}

export const automationsFixture: WorkspaceAutomationRecord[] = [
  createAutomationSummary(),
  createAutomationSummary({
    id: "33333333-3333-4333-8333-333333333333",
    name: "Weekly translation sync",
    status: "active",
    triggerConfig: {
      mode: "scheduled",
      schedule: {
        cadence: "weekly",
        hourUtc: 9,
        dayOfWeek: 1,
        timezone: "UTC",
      },
    },
    toolConfig: {
      github: {
        enabled: true,
        pushSource: true,
        pullTranslations: true,
        validation: false,
      },
      slack: {
        enabled: false,
      },
      email: {
        enabled: true,
        recipients: ["team@example.com"],
      },
      contentful: disabledContentfulToolConfig,
    },
    createdAt: "2026-06-01T08:00:00.000Z",
  }),
  createAutomationSummary({
    id: "44444444-4444-4444-8444-444444444444",
    name: "Manual release checklist",
    status: "paused",
    triggerConfig: { mode: "manual" },
    toolConfig: {
      github: {
        enabled: false,
        pushSource: false,
        pullTranslations: false,
        validation: false,
      },
      slack: {
        enabled: true,
        channelId: "C07654321",
      },
      email: {
        enabled: false,
      },
      contentful: disabledContentfulToolConfig,
    },
    createdAt: "2026-05-20T14:30:00.000Z",
  }),
];
