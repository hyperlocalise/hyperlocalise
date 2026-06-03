import { createLogger } from "@/lib/log";
import { schema } from "@/lib/database";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import {
  getActiveOrganizationExternalTmsProviderCredentialRow,
  resolveExternalTmsSecretMaterial,
  type ExternalTmsCredential,
  type ExternalTmsProviderKind,
  type ExternalTmsProviderCredentialSummary,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import {
  tmsProviderGlossaryFetchers,
  tmsProviderJobTaskFetchers,
  tmsProviderProjectFetchers,
  tmsProviderTranslationMemoryFetchers,
} from "@/lib/providers/tms-provider-fetcher-registry";
import {
  encodeProviderJobId,
  encodeProviderProjectId,
  parseProviderJobId,
  parseProviderProjectId,
  type EncodedProviderProjectId,
} from "@/lib/providers/tms-provider-resource-id";
import { mapProviderStatusToNormalized } from "@/lib/providers/sync/external-tms-status-mapper";
import type { ExternalTmsGlossaryMetadata } from "@/lib/providers/sync/external-tms-glossary-sync";
import type { ExternalTmsJobTaskMetadata } from "@/lib/providers/sync/external-tms-job-sync";
import type { ExternalTmsProjectMetadata } from "@/lib/providers/sync/external-tms-project-sync";
import type { ExternalTmsTranslationMemoryMetadata } from "@/lib/providers/sync/external-tms-tm-sync";

const logger = createLogger("tms-provider-live");

const LIVE_PROJECT_JOB_FANOUT_CONCURRENCY = 5;
const LIVE_GLOSSARY_TM_FANOUT_CONCURRENCY = 5;

type ExternalTmsProject = typeof schema.projects.$inferSelect;

export class TmsProviderLiveError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "TmsProviderLiveError";
  }
}

export type TmsProviderConnection = {
  providerKind: ExternalTmsProviderKind;
  displayName: string;
  validationStatus: string;
  validationMessage: string | null;
};

export type TmsProviderLiveProject = {
  id: string;
  name: string;
  description: string | null;
  translationContext: string | null;
  createdAt: string;
  updatedAt: string;
  source: "external_tms";
  externalProviderKind: ExternalTmsProviderKind;
  externalProjectId: string;
  sourceLocale: string | null;
  targetLocales: string[];
  externalProjectUrl: string | null;
  isActive: boolean;
  openJobCount: number;
};

export type TmsProviderLiveJob = {
  id: string;
  projectId: string;
  projectName: string | null;
  createdByUserId: string | null;
  kind: "translation" | "research" | "review" | "sync" | "asset_management";
  type: null;
  status: ReturnType<typeof mapProviderStatusToNormalized>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  workflowRunId: string | null;
  lastError: string | null;
  inputPayload: unknown;
  outcomeKind: string | null;
  outcomePayload: unknown;
  reviewCriteria: string | null;
  reviewTargetLocale: string | null;
  syncConnectorKind: string | null;
  syncDirection: string | null;
  assetType: string | null;
  assetOperation: string | null;
  externalProviderKind: ExternalTmsProviderKind;
  externalTaskId: string | null;
  externalStatus: string;
  externalTitle: string;
  externalDueDate: string | null;
  externalTargetLocales: string[];
  externalAssignedUsers: string[];
  externalSyncState: null;
};

export type TmsProviderLiveJobDetail = TmsProviderLiveJob & {
  externalJobId: string;
  externalUrl: string | null;
  externalProviderPayload: Record<string, unknown>;
};

export type TmsProviderLiveGlossary = {
  id: string;
  name: string;
  description: string | null;
  sourceLocale: string;
  targetLocale: string;
  localeCoverage: string[];
  termCount: number | null;
  externalUrl: string | null;
  externalProjectId: string;
  projectName: string | null;
};

export type TmsProviderLiveTranslationMemory = {
  id: string;
  name: string;
  description: string | null;
  sourceLocale: string;
  localeCoverage: string[];
  segmentCount: number | null;
  externalUrl: string | null;
  externalProjectId: string;
  projectName: string | null;
};

type ActiveTmsProviderContext = {
  organizationId: string;
  credential: ExternalTmsCredential;
  summary: ExternalTmsProviderCredentialSummary;
  secretMaterial: string;
  providerKind: ExternalTmsProviderKind;
};

async function loadActiveTmsProviderContext(
  organizationId: string,
): Promise<ActiveTmsProviderContext> {
  const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(organizationId);
  if (!credential) {
    throw new TmsProviderLiveError("no_active_tms_provider", "No external TMS is connected.");
  }

  const providerKind = credential.providerKind as ExternalTmsProviderKind;
  const secretMaterial = await resolveExternalTmsSecretMaterial({ credential });

  return {
    organizationId,
    credential,
    summary: {
      id: credential.id,
      providerKind,
      displayName: credential.displayName,
      authMode: credential.authMode,
      region: credential.region,
      baseUrl: credential.baseUrl,
      oauthExpiresAt: credential.oauthExpiresAt?.toISOString() ?? null,
      validationStatus: credential.validationStatus,
      validationMessage: credential.validationMessage,
      lastValidatedAt: credential.lastValidatedAt?.toISOString() ?? null,
      maskedSecretSuffix: credential.maskedSecretSuffix,
      createdAt: credential.createdAt.toISOString(),
      updatedAt: credential.updatedAt.toISOString(),
    },
    secretMaterial,
    providerKind,
  };
}

function rethrowProviderFetcherError(error: unknown): never {
  if (error instanceof Error) {
    if (error.message === "crowdin_auth_invalid") {
      throw new TmsProviderLiveError("crowdin_auth_invalid", "Crowdin credentials are invalid.");
    }
    throw error;
  }

  throw error;
}

function buildLiveProviderProject(input: {
  organizationId: string;
  credentialId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  name: string;
  sourceLocale: string;
  targetLocales: string[];
  externalProjectUrl?: string | null;
  isActive?: boolean;
}): ExternalTmsProject {
  const now = new Date();

  return {
    id: encodeProviderProjectId({
      providerKind: input.providerKind,
      externalProjectId: input.externalProjectId,
    }),
    organizationId: input.organizationId,
    teamId: null,
    createdByUserId: null,
    name: input.name,
    description: "",
    translationContext: "",
    source: "external_tms",
    externalProviderKind: input.providerKind,
    externalProviderCredentialId: input.credentialId,
    externalProjectId: input.externalProjectId,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    externalProjectUrl: input.externalProjectUrl ?? null,
    isActive: input.isActive ?? true,
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    providerMetadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

function mapLiveProject(
  providerKind: ExternalTmsProviderKind,
  project: ExternalTmsProjectMetadata,
): TmsProviderLiveProject {
  const timestamp = new Date().toISOString();
  const sourceLocale = project.sourceLocale ?? "en";
  const targetLocales = project.targetLocales ?? [];

  return {
    id: encodeProviderProjectId({ providerKind, externalProjectId: project.externalProjectId }),
    name: project.name,
    description: null,
    translationContext: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    source: "external_tms",
    externalProviderKind: providerKind,
    externalProjectId: project.externalProjectId,
    sourceLocale,
    targetLocales,
    externalProjectUrl: project.externalProjectUrl ?? null,
    isActive: project.isActive ?? true,
    openJobCount: 0,
  };
}

function normalizeExternalTimestamp(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return null;
}

function mapLiveJob(input: {
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  projectName: string;
  task: ExternalTmsJobTaskMetadata;
}): TmsProviderLiveJob {
  const timestamp = new Date().toISOString();
  const status = mapProviderStatusToNormalized(input.providerKind, input.task.externalStatus);
  const targetLocales = input.task.targetLocales ?? [];
  const assignedUsers = input.task.assignedUsers ?? [];
  const dueDate =
    input.task.dueDate instanceof Date
      ? input.task.dueDate.toISOString()
      : typeof input.task.dueDate === "string"
        ? input.task.dueDate
        : null;

  return {
    id: encodeProviderJobId({
      providerKind: input.providerKind,
      externalProjectId: input.externalProjectId,
      externalJobId: input.task.externalJobId,
    }),
    projectId: encodeProviderProjectId({
      providerKind: input.providerKind,
      externalProjectId: input.externalProjectId,
    }),
    projectName: input.projectName,
    createdByUserId: null,
    kind: input.task.kind ?? "translation",
    type: null,
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt:
      status === "succeeded" || status === "failed"
        ? normalizeExternalTimestamp(input.task.completedAt)
        : null,
    workflowRunId: null,
    lastError: null,
    inputPayload: null,
    outcomeKind: null,
    outcomePayload: null,
    reviewCriteria: null,
    reviewTargetLocale: targetLocales[0] ?? null,
    syncConnectorKind: null,
    syncDirection: null,
    assetType: null,
    assetOperation: null,
    externalProviderKind: input.providerKind,
    externalTaskId: input.task.externalTaskId ?? null,
    externalStatus: input.task.externalStatus,
    externalTitle: input.task.title ?? "Untitled task",
    externalDueDate: dueDate,
    externalTargetLocales: targetLocales,
    externalAssignedUsers: assignedUsers,
    externalSyncState: null,
  };
}

async function fetchLiveProjects(context: ActiveTmsProviderContext) {
  const fetcher = tmsProviderProjectFetchers[context.providerKind];
  if (!fetcher) {
    throw new TmsProviderLiveError(
      "provider_fetcher_unavailable",
      `Live project fetch is not available for ${context.providerKind}.`,
    );
  }

  try {
    return await fetcher({
      organizationId: context.organizationId,
      providerKind: context.providerKind,
      credential: context.credential,
      secretMaterial: context.secretMaterial,
    });
  } catch (error) {
    rethrowProviderFetcherError(error);
  }
}

export async function getTmsProviderConnection(
  organizationId: string,
): Promise<TmsProviderConnection | null> {
  const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(organizationId);
  if (!credential) {
    return null;
  }

  return {
    providerKind: credential.providerKind as ExternalTmsProviderKind,
    displayName: credential.displayName,
    validationStatus: credential.validationStatus,
    validationMessage: credential.validationMessage,
  };
}

export async function listTmsProviderLiveProjects(
  organizationId: string,
): Promise<TmsProviderLiveProject[]> {
  const context = await loadActiveTmsProviderContext(organizationId);
  const projects = await fetchLiveProjects(context);

  return projects
    .filter((project) => project.isActive !== false)
    .map((project) => mapLiveProject(context.providerKind, project));
}

export async function getTmsProviderLiveProject(
  organizationId: string,
  externalProjectId: string,
): Promise<TmsProviderLiveProject | null> {
  const projects = await listTmsProviderLiveProjects(organizationId);
  return projects.find((project) => project.externalProjectId === externalProjectId) ?? null;
}

export async function listTmsProviderLiveJobsForProject(
  organizationId: string,
  externalProjectId: string,
  options?: {
    mine?: boolean;
    assignee?: string | null;
    context?: ActiveTmsProviderContext;
    projects?: ExternalTmsProjectMetadata[];
  },
): Promise<TmsProviderLiveJob[]> {
  const context = options?.context ?? (await loadActiveTmsProviderContext(organizationId));
  const fetcher = tmsProviderJobTaskFetchers[context.providerKind];
  if (!fetcher) {
    throw new TmsProviderLiveError(
      "provider_fetcher_unavailable",
      `Live job fetch is not available for ${context.providerKind}.`,
    );
  }

  const projects = options?.projects ?? (await fetchLiveProjects(context));
  const project = projects.find((item) => item.externalProjectId === externalProjectId);
  if (!project) {
    return [];
  }

  const liveProject = buildLiveProviderProject({
    organizationId: context.organizationId,
    credentialId: context.credential.id,
    providerKind: context.providerKind,
    externalProjectId: project.externalProjectId,
    name: project.name,
    sourceLocale: project.sourceLocale ?? "en",
    targetLocales: project.targetLocales ?? [],
    externalProjectUrl: project.externalProjectUrl,
    isActive: project.isActive,
  });

  let tasks;
  try {
    tasks = await fetcher({
      organizationId: context.organizationId,
      projectId: liveProject.id,
      providerKind: context.providerKind,
      externalProjectId,
      credential: context.credential,
      project: liveProject,
      secretMaterial: context.secretMaterial,
    });
  } catch (error) {
    rethrowProviderFetcherError(error);
  }

  const assigneeNeedle = options?.assignee?.trim().toLowerCase();
  const filteredTasks =
    options?.mine && assigneeNeedle
      ? tasks.filter((task) =>
          (task.assignedUsers ?? []).some((user) => user.toLowerCase().includes(assigneeNeedle)),
        )
      : tasks;

  return filteredTasks.map((task) =>
    mapLiveJob({
      providerKind: context.providerKind,
      externalProjectId,
      projectName: project.name,
      task,
    }),
  );
}

export async function listTmsProviderLiveJobs(
  organizationId: string,
  options?: { mine?: boolean; assignee?: string | null },
): Promise<TmsProviderLiveJob[]> {
  const context = await loadActiveTmsProviderContext(organizationId);
  const projects = await fetchLiveProjects(context);
  const activeProjects = projects.filter((project) => project.isActive !== false);

  const jobsByProject = await mapWithConcurrency(
    activeProjects,
    LIVE_PROJECT_JOB_FANOUT_CONCURRENCY,
    async (project) =>
      listTmsProviderLiveJobsForProject(organizationId, project.externalProjectId, {
        ...options,
        context,
        projects,
      }),
  );

  return jobsByProject.flat();
}

export async function getTmsProviderLiveJobDetail(
  organizationId: string,
  encodedJobId: string,
): Promise<TmsProviderLiveJobDetail | null> {
  const parsed = parseProviderJobId(encodedJobId);
  if (!parsed) {
    throw new TmsProviderLiveError("invalid_encoded_job_id", "Job id is not a provider job id.");
  }

  const context = await loadActiveTmsProviderContext(organizationId);
  if (context.providerKind !== parsed.providerKind) {
    return null;
  }

  const fetcher = tmsProviderJobTaskFetchers[context.providerKind];
  if (!fetcher) {
    throw new TmsProviderLiveError(
      "provider_fetcher_unavailable",
      `Live job fetch is not available for ${context.providerKind}.`,
    );
  }

  const projects = await fetchLiveProjects(context);
  const project = projects.find((item) => item.externalProjectId === parsed.externalProjectId);
  if (!project) {
    return null;
  }

  const liveProject = buildLiveProviderProject({
    organizationId: context.organizationId,
    credentialId: context.credential.id,
    providerKind: context.providerKind,
    externalProjectId: project.externalProjectId,
    name: project.name,
    sourceLocale: project.sourceLocale ?? "en",
    targetLocales: project.targetLocales ?? [],
    externalProjectUrl: project.externalProjectUrl,
    isActive: project.isActive,
  });

  let tasks;
  try {
    tasks = await fetcher({
      organizationId: context.organizationId,
      projectId: liveProject.id,
      providerKind: context.providerKind,
      externalProjectId: parsed.externalProjectId,
      credential: context.credential,
      project: liveProject,
      secretMaterial: context.secretMaterial,
    });
  } catch (error) {
    rethrowProviderFetcherError(error);
  }

  const task = tasks.find((item) => item.externalJobId === parsed.externalJobId);
  if (!task) {
    return null;
  }

  const job = mapLiveJob({
    providerKind: context.providerKind,
    externalProjectId: parsed.externalProjectId,
    projectName: project.name,
    task,
  });

  return {
    ...job,
    externalJobId: parsed.externalJobId,
    externalUrl: task.externalUrl ?? null,
    externalProviderPayload:
      task.providerPayload && typeof task.providerPayload === "object"
        ? (task.providerPayload as Record<string, unknown>)
        : {},
  };
}

function dedupeGlossaries(items: TmsProviderLiveGlossary[]) {
  const byId = new Map<string, TmsProviderLiveGlossary>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

function mapLiveGlossary(input: {
  glossary: ExternalTmsGlossaryMetadata;
  externalProjectId: string;
  projectName: string;
  providerKind: ExternalTmsProviderKind;
}): TmsProviderLiveGlossary {
  return {
    id: `${input.providerKind}:glossary:${input.glossary.externalGlossaryId}`,
    name: input.glossary.name,
    description: input.glossary.description ?? null,
    sourceLocale: input.glossary.sourceLocale,
    targetLocale: input.glossary.targetLocale,
    localeCoverage: input.glossary.localeCoverage ?? [],
    termCount: input.glossary.termCount ?? null,
    externalUrl: input.glossary.externalUrl ?? null,
    externalProjectId: input.externalProjectId,
    projectName: input.projectName,
  };
}

export async function listTmsProviderLiveGlossaries(
  organizationId: string,
  options?: { externalProjectId?: string },
): Promise<TmsProviderLiveGlossary[]> {
  const context = await loadActiveTmsProviderContext(organizationId);
  const fetcher = tmsProviderGlossaryFetchers[context.providerKind];
  if (!fetcher) {
    throw new TmsProviderLiveError(
      "provider_fetcher_unavailable",
      `Live glossary fetch is not available for ${context.providerKind}.`,
    );
  }

  const projects = await fetchLiveProjects(context);
  const scopedProjects = options?.externalProjectId
    ? projects.filter((project) => project.externalProjectId === options.externalProjectId)
    : projects.filter((project) => project.isActive !== false);

  const glossariesByProject = await mapWithConcurrency(
    scopedProjects,
    LIVE_GLOSSARY_TM_FANOUT_CONCURRENCY,
    async (project) => {
      const liveProject = buildLiveProviderProject({
        organizationId: context.organizationId,
        credentialId: context.credential.id,
        providerKind: context.providerKind,
        externalProjectId: project.externalProjectId,
        name: project.name,
        sourceLocale: project.sourceLocale ?? "en",
        targetLocales: project.targetLocales ?? [],
        externalProjectUrl: project.externalProjectUrl,
        isActive: project.isActive,
      });

      try {
        const glossaries = await fetcher({
          organizationId: context.organizationId,
          projectId: liveProject.id,
          providerKind: context.providerKind,
          externalProjectId: project.externalProjectId,
          credential: context.credential,
          project: liveProject,
          secretMaterial: context.secretMaterial,
        });

        return glossaries.map((glossary) =>
          mapLiveGlossary({
            glossary,
            externalProjectId: project.externalProjectId,
            projectName: project.name,
            providerKind: context.providerKind,
          }),
        );
      } catch (error) {
        logger.warn("tms_provider_live_glossary_project_failed", {
          organizationId,
          providerKind: context.providerKind,
          externalProjectId: project.externalProjectId,
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    },
  );

  return dedupeGlossaries(glossariesByProject.flat());
}

function mapLiveTranslationMemory(input: {
  memory: ExternalTmsTranslationMemoryMetadata;
  externalProjectId: string;
  projectName: string;
  providerKind: ExternalTmsProviderKind;
}): TmsProviderLiveTranslationMemory {
  return {
    id: `${input.providerKind}:tm:${input.memory.externalMemoryId}`,
    name: input.memory.name,
    description: input.memory.description ?? null,
    sourceLocale: input.memory.sourceLocale,
    localeCoverage: input.memory.localeCoverage ?? [],
    segmentCount: input.memory.segmentCount ?? null,
    externalUrl: input.memory.externalUrl ?? null,
    externalProjectId: input.externalProjectId,
    projectName: input.projectName,
  };
}

export async function listTmsProviderLiveTranslationMemories(
  organizationId: string,
  options?: { externalProjectId?: string },
): Promise<TmsProviderLiveTranslationMemory[]> {
  const context = await loadActiveTmsProviderContext(organizationId);
  const fetcher = tmsProviderTranslationMemoryFetchers[context.providerKind];
  if (!fetcher) {
    throw new TmsProviderLiveError(
      "provider_fetcher_unavailable",
      `Live translation memory fetch is not available for ${context.providerKind}.`,
    );
  }

  const projects = await fetchLiveProjects(context);
  const scopedProjects = options?.externalProjectId
    ? projects.filter((project) => project.externalProjectId === options.externalProjectId)
    : projects.filter((project) => project.isActive !== false);

  const memoriesByProject = await mapWithConcurrency(
    scopedProjects,
    LIVE_GLOSSARY_TM_FANOUT_CONCURRENCY,
    async (project) => {
      const liveProject = buildLiveProviderProject({
        organizationId: context.organizationId,
        credentialId: context.credential.id,
        providerKind: context.providerKind,
        externalProjectId: project.externalProjectId,
        name: project.name,
        sourceLocale: project.sourceLocale ?? "en",
        targetLocales: project.targetLocales ?? [],
        externalProjectUrl: project.externalProjectUrl,
        isActive: project.isActive,
      });

      try {
        const memories = await fetcher({
          organizationId: context.organizationId,
          projectId: liveProject.id,
          providerKind: context.providerKind,
          externalProjectId: project.externalProjectId,
          credential: context.credential,
          project: liveProject,
          secretMaterial: context.secretMaterial,
        });

        return memories.map((memory) =>
          mapLiveTranslationMemory({
            memory,
            externalProjectId: project.externalProjectId,
            projectName: project.name,
            providerKind: context.providerKind,
          }),
        );
      } catch (error) {
        logger.warn("tms_provider_live_tm_project_failed", {
          organizationId,
          providerKind: context.providerKind,
          externalProjectId: project.externalProjectId,
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    },
  );

  const byId = new Map<string, TmsProviderLiveTranslationMemory>();
  for (const memory of memoriesByProject.flat()) {
    byId.set(memory.id, memory);
  }

  return [...byId.values()];
}

export function parseTmsProviderProjectRouteId(
  value: string,
): EncodedProviderProjectId | { externalProjectId: string } {
  const encoded = parseProviderProjectId(value);
  if (encoded) {
    return encoded;
  }

  return { externalProjectId: value };
}
