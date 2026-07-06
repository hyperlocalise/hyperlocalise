import type { AgentRunRecord, JobDetailRecord, ProviderBackedJobFields } from "./job-detail-types";
import type {
  TmsProviderLiveJobComment,
  TmsProviderLiveJobDetail,
} from "@/lib/providers/jobs/tms-provider-live";

const fixedNow = Date.UTC(2026, 5, 6, 12, 0, 0);

function iso(offsetMs: number) {
  return new Date(fixedNow + offsetMs).toISOString();
}

export const jobDetailFixtureNow = fixedNow;

export function createNativeJobDetail(overrides: Partial<JobDetailRecord> = {}): JobDetailRecord {
  return {
    id: "job_translate_homepage",
    projectId: "project_website",
    projectName: "Website",
    createdByUserId: "user_001",
    ownerUserId: "user_001",
    kind: "translation",
    type: "file",
    status: "running",
    inputPayload: {
      sourceFileId: "marketing/home.json",
      sourceLocale: "en",
      targetLocales: ["fr-FR", "de-DE"],
      fileFormat: "json",
    },
    outcomeKind: null,
    outcomePayload: null,
    lastError: null,
    workflowRunId: "wf_run_001",
    interactionId: null,
    contextSnapshot: { locale: "fr-FR" },
    reviewCriteria: null,
    reviewTargetLocale: null,
    reviewConfig: null,
    syncConnectorKind: null,
    syncDirection: null,
    syncExternalIdentifiers: null,
    assetType: null,
    assetOperation: null,
    assetConfig: null,
    externalProviderKind: null,
    externalJobId: null,
    externalTaskId: null,
    externalStatus: null,
    externalTitle: null,
    externalDueDate: null,
    externalTargetLocales: null,
    externalAssignedUsers: null,
    externalUrl: null,
    externalSyncState: null,
    externalProviderPayload: null,
    linkedJobId: null,
    createdAt: iso(-86_400_000),
    updatedAt: iso(-600_000),
    completedAt: null,
    ...overrides,
  };
}

export function createProviderBackedJobDetail(
  overrides: Partial<JobDetailRecord> = {},
): JobDetailRecord {
  return createNativeJobDetail({
    id: "job_crowdin_1204",
    externalProviderKind: "crowdin",
    externalJobId: "1204",
    externalTaskId: "CR-1204",
    externalStatus: "in_progress",
    externalTitle: "Translate marketing homepage",
    externalDueDate: iso(86_400_000),
    externalTargetLocales: ["fr-FR", "de-DE"],
    externalAssignedUsers: ["Mina", "Otto"],
    externalUrl: "https://crowdin.example/tasks/1204",
    externalSyncState: "synced",
    externalProviderPayload: {
      type: 0,
      targetLanguageIds: ["fr-FR", "de-DE"],
      languageId: "fr-FR",
      description: "Translate the launch campaign strings.",
      localeReadiness: {
        translationProgress: 68,
        approvalProgress: 24,
        words: { total: 2400, translated: 1580, approved: 520 },
      },
    },
    providerSourceFiles: [
      {
        id: "file_home_json",
        displayName: "home.json",
        sourcePath: "marketing/home.json",
        resourceType: "json",
        externalUrl: null,
      },
    ],
    providerActions: [
      {
        id: "translate_with_agent",
        label: "Translate with agent",
        agentRunKind: "translate_with_agent",
        visible: true,
        enabled: true,
      },
      {
        id: "review_with_agent",
        label: "Review with agent",
        agentRunKind: "review_with_agent",
        visible: true,
        enabled: false,
        disabledReason: "Waiting for translation to finish",
      },
    ],
    ...overrides,
  });
}

export function createLiveCrowdinJobDetail(
  overrides: Partial<TmsProviderLiveJobDetail> = {},
): TmsProviderLiveJobDetail {
  return {
    id: "ext:crowdin:task:1204",
    projectId: "project_website",
    projectName: "Website",
    createdByUserId: null,
    kind: "translation",
    type: null,
    status: "running",
    createdAt: iso(-86_400_000),
    updatedAt: iso(-600_000),
    completedAt: null,
    workflowRunId: null,
    lastError: null,
    inputPayload: null,
    outcomeKind: null,
    outcomePayload: null,
    reviewCriteria: null,
    reviewTargetLocale: null,
    syncConnectorKind: null,
    syncDirection: null,
    assetType: null,
    assetOperation: null,
    externalProviderKind: "crowdin",
    externalTaskId: "1204",
    externalStatus: "in_progress",
    externalTitle: "Translate marketing homepage",
    externalDueDate: iso(86_400_000),
    externalTargetLocales: ["fr-FR", "de-DE"],
    externalAssignedUsers: ["Mina", "Otto"],
    externalSyncState: null,
    externalJobId: "1204",
    externalUrl: "https://crowdin.example/tasks/1204",
    externalProviderPayload: {
      type: 0,
      targetLanguageIds: ["fr-FR", "de-DE"],
      languageId: "fr-FR",
      description:
        "Translate the launch campaign strings for the marketing homepage refresh. Preserve product names, ICU placeholders, and analytics event keys exactly as written. Keep the French CTA concise enough to fit the existing button layout, and use a confident but friendly tone for the hero headline, pricing section, and customer proof points.",
      localeReadiness: {
        translationProgress: 68,
        approvalProgress: 24,
        words: { total: 2400, translated: 1580, approved: 520 },
      },
    },
    ...overrides,
  };
}

export function createLiveCrowdinJobComments(): TmsProviderLiveJobComment[] {
  return [
    {
      id: "comment_001",
      externalCommentId: "c_001",
      userId: "42",
      taskId: "1204",
      text: "Please preserve the product name casing in the hero headline.",
      timeSpentSeconds: 900,
      createdAt: iso(-3_600_000),
      updatedAt: iso(-3_600_000),
    },
    {
      id: "comment_002",
      externalCommentId: "c_002",
      userId: "17",
      taskId: "1204",
      text: "Keep the CTA short in French. The button needs to fit the existing hero layout.",
      timeSpentSeconds: 600,
      createdAt: iso(-3_300_000),
      updatedAt: iso(-3_300_000),
    },
    {
      id: "comment_003",
      externalCommentId: "c_003",
      userId: "84",
      taskId: "1204",
      text: "German copy can be longer, but please avoid changing the placeholder order.",
      timeSpentSeconds: 420,
      createdAt: iso(-3_000_000),
      updatedAt: iso(-3_000_000),
    },
    {
      id: "comment_004",
      externalCommentId: "c_004",
      userId: "42",
      taskId: "1204",
      text: "The product name should stay untranslated across all target locales.",
      timeSpentSeconds: 300,
      createdAt: iso(-2_700_000),
      updatedAt: iso(-2_700_000),
    },
    {
      id: "comment_005",
      externalCommentId: "c_005",
      userId: "31",
      taskId: "1204",
      text: "Please check the plural forms for the pricing section before marking this ready.",
      timeSpentSeconds: 780,
      createdAt: iso(-2_400_000),
      updatedAt: iso(-2_400_000),
    },
    {
      id: "comment_006",
      externalCommentId: "c_006",
      userId: "17",
      taskId: "1204",
      text: "There are two headline variants in the source file. Translate both, but keep the tone consistent.",
      timeSpentSeconds: 540,
      createdAt: iso(-2_100_000),
      updatedAt: iso(-2_100_000),
    },
    {
      id: "comment_007",
      externalCommentId: "c_007",
      userId: "66",
      taskId: "1204",
      text: "Do not translate the analytics event names in the JSON keys.",
      timeSpentSeconds: 240,
      createdAt: iso(-1_800_000),
      updatedAt: iso(-1_800_000),
    },
    {
      id: "comment_008",
      externalCommentId: "c_008",
      userId: "84",
      taskId: "1204",
      text: "Final pass should compare the French strings against the latest approved glossary.",
      timeSpentSeconds: 960,
      createdAt: iso(-1_500_000),
      updatedAt: iso(-1_500_000),
    },
  ];
}

export function createAgentRunRecords(): AgentRunRecord[] {
  return [
    {
      id: "agent_run_001",
      kind: "translate_with_agent",
      status: "succeeded",
      inputSnapshot: { locale: "fr-FR" },
      outputSummary: { proposedCount: 12 },
      changedItems: [{ id: "item_1" }],
      warnings: [],
      createdAt: iso(-7_200_000),
      completedAt: iso(-6_800_000),
    },
    {
      id: "agent_run_002",
      kind: "review_with_agent",
      status: "running",
      inputSnapshot: { locale: "fr-FR" },
      outputSummary: {},
      changedItems: [],
      warnings: [],
      createdAt: iso(-1_800_000),
      completedAt: null,
    },
  ];
}

export function toProviderBackedJobFields(job: JobDetailRecord): ProviderBackedJobFields {
  return {
    externalProviderKind: job.externalProviderKind!,
    externalJobId: job.externalJobId,
    externalTaskId: job.externalTaskId,
    externalStatus: job.externalStatus,
    externalTitle: job.externalTitle,
    externalDueDate: job.externalDueDate,
    externalTargetLocales: job.externalTargetLocales,
    externalAssignedUsers: job.externalAssignedUsers,
    externalUrl: job.externalUrl,
    externalSyncState: job.externalSyncState,
    externalProviderPayload: job.externalProviderPayload,
    lastError: job.lastError,
    updatedAt: job.updatedAt,
    providerSourceFiles: job.providerSourceFiles,
    providerActions: job.providerActions,
  };
}
