/**
 * Phrase TMS (Memsource) API client for job and resource sync.
 */


import { resolvePhraseTmsBaseUrl } from "./phrase-tms-base-url";

export interface PhraseTmsApiClientOptions {
  token: string;
  baseUrl?: string | null;
  fetchFn?: typeof fetch;
}

export interface PhraseTmsJobPart {
  uid: string;
  innerId: string;
  status: string;
  targetLang: string;
  filename: string;
  dateDue: string | null;
  dateCreated: string | null;
  workflowStep: {
    id: string | null;
    name: string | null;
    order: number | null;
    workflowLevel: number | null;
  } | null;
  owner: {
    email: string | null;
    userName: string | null;
  } | null;
  importStatus: {
    status: string | null;
    errorMessage: string | null;
  } | null;
}

export interface PhraseTmsResourceReference {
  uid: string;
  name: string;
  id: string | null;
}

export interface PhraseTmsSearchSegmentResult {
  score: number | null;
  segmentId: string | null;
  sourceText: string;
  targetText: string;
  targetLocale: string | null;
  transMemoryUid: string | null;
  transMemoryName: string | null;
}

export interface PhraseTmsConversationUser {
  uid: string | null;
  userName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

export interface PhraseTmsConversationComment {
  id: string;
  text: string;
  createdAt: string | null;
  updatedAt: string | null;
  author: PhraseTmsConversationUser | null;
}

export interface PhraseTmsLqaConversationReference {
  segmentId: string | null;
  commentedText: string | null;
  errorCategoryId: number | null;
  severityId: number | null;
  repeated: string | null;
}

export interface PhraseTmsConversation {
  id: string;
  type: "lqa" | "plain";
  description: string | null;
  deleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  resolvedAt: string | null;
  state: "open" | "resolved" | "unknown";
  author: PhraseTmsConversationUser | null;
  resolver: PhraseTmsConversationUser | null;
  comments: PhraseTmsConversationComment[];
  lqaReference: PhraseTmsLqaConversationReference | null;
}

export interface PhraseTmsAuthenticatedUser {
  uid: string;
  username: string;
  email: string | null;
  fullName: string | null;
}

export class PhraseTmsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: unknown,
  ) {
    super(message);
    this.name = "PhraseTmsApiError";
  }
}

export class PhraseTmsApiClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: PhraseTmsApiClientOptions) {
    this.token = options.token;
    this.baseUrl = resolvePhraseTmsBaseUrl({ baseUrl: options.baseUrl });
    this.fetchFn = options.fetchFn ?? fetch;
  }

  get resolvedBaseUrl() {
    return this.baseUrl;
  }

  async getAuthenticatedUser(): Promise<PhraseTmsAuthenticatedUser> {
    const response = await this.get<PhraseTmsWhoAmIApiRecord>("/api2/v1/auth/whoAmI");
    const user = response.user;
    const uid = user?.uid ?? user?.id;
    if (!uid) {
      throw new PhraseTmsApiError("Phrase TMS whoAmI response did not include a user uid", 500, {
        user,
      });
    }

    const firstName = user?.firstName?.trim() ?? "";
    const lastName = user?.lastName?.trim() ?? "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;

    return {
      uid,
      username: user?.userName ?? user?.email ?? uid,
      email: user?.email ?? null,
      fullName,
    };
  }

  async listJobParts(projectUid: string, workflowLevel: number): Promise<PhraseTmsJobPart[]> {
    const jobs: PhraseTmsJobPart[] = [];
    let pageNumber = 0;
    const pageSize = 50;

    while (true) {
      const path = this.buildPath(`/api2/v2/projects/${encodeURIComponent(projectUid)}/jobs`, {
        pageNumber,
        pageSize,
        workflowLevel,
      });
      const page = await this.get<PhraseTmsJobsPageApiRecord>(path);
      jobs.push(...(page.content ?? []).map(normalizePhraseTmsJobPart));

      const totalPages = page.totalPages ?? 0;
      if (pageNumber + 1 >= totalPages || (page.content?.length ?? 0) < pageSize) {
        break;
      }

      pageNumber += 1;
    }

    return jobs;
  }

  async listAllJobParts(projectUid: string, maxWorkflowLevel = 15): Promise<PhraseTmsJobPart[]> {
    const byUid = new Map<string, PhraseTmsJobPart>();

    for (let workflowLevel = 1; workflowLevel <= maxWorkflowLevel; workflowLevel += 1) {
      const jobParts = await this.listJobParts(projectUid, workflowLevel);
      if (jobParts.length === 0) {
        break;
      }

      for (const jobPart of jobParts) {
        byUid.set(jobPart.uid, jobPart);
      }
    }

    return [...byUid.values()];
  }

  async getProjectTranslationMemories(input: {
    projectUid: string;
    targetLang?: string | null;
    workflowStepUid?: string | null;
  }): Promise<PhraseTmsResourceReference[]> {
    const path = this.buildPath(
      `/api2/v3/projects/${encodeURIComponent(input.projectUid)}/transMemories`,
      {
        targetLang: input.targetLang,
        wfStepUid: input.workflowStepUid,
      },
    );
    const response = await this.get<PhraseTmsTransMemoriesApiRecord>(path);
    return normalizePhraseTmsResourceList(response.transMemories);
  }

  async getProjectTermBases(projectUid: string): Promise<PhraseTmsResourceReference[]> {
    const path = `/api2/v1/projects/${encodeURIComponent(projectUid)}/termBases`;
    const response = await this.get<PhraseTmsTermBasesApiRecord>(path);
    return normalizePhraseTmsResourceList(response.termBases);
  }

  async listLqaConversations(jobUid: string): Promise<PhraseTmsConversation[]> {
    const path = `/api2/v1/jobs/${encodeURIComponent(jobUid)}/conversations/lqas`;
    const response = await this.get<PhraseTmsLqaConversationsApiRecord>(path);
    return (response.conversations ?? []).map((conversation) =>
      normalizePhraseTmsConversation(conversation, "lqa"),
    );
  }

  async listPlainConversations(jobUid: string): Promise<PhraseTmsConversation[]> {
    const path = `/api2/v1/jobs/${encodeURIComponent(jobUid)}/conversations/plains`;
    const response = await this.get<PhraseTmsPlainConversationsApiRecord>(path);
    return (response.conversations ?? []).map((conversation) =>
      normalizePhraseTmsConversation(conversation, "plain"),
    );
  }

  async searchJobTranslationMemorySegment(input: {
    projectUid: string;
    jobUid: string;
    segment: string;
    maxSegments?: number;
    scoreThreshold?: number;
  }): Promise<PhraseTmsSearchSegmentResult[]> {
    const path = `/api2/v1/projects/${encodeURIComponent(input.projectUid)}/jobs/${encodeURIComponent(input.jobUid)}/transMemories/searchSegment`;
    const response = await this.post<PhraseTmsSearchSegmentResponseApiRecord>(path, {
      segment: input.segment,
      maxSegments: input.maxSegments ?? 5,
      scoreThreshold: input.scoreThreshold ?? 0.5,
    });
    return normalizePhraseTmsSearchSegmentResults(response.searchResults);
  }

  private buildPath(
    path: string,
    query: Record<string, string | number | null | undefined>,
  ): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === "") {
        continue;
      }
      params.set(key, String(value));
    }

    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: phraseTmsAuthorizationHeader(this.token),
      Accept: "application/json",
      "User-Agent": "Hyperlocalise TMS connector",
    };
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>(path, {
      method: "GET",
      headers: this.authHeaders(),
    });
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await this.fetchFn(url, { ...init, redirect: "error" });

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text().catch(() => null);
      }

      throw new PhraseTmsApiError(
        `Phrase TMS API returned HTTP ${response.status} for ${path}`,
        response.status,
        body,
      );
    }

    return response.json() as Promise<T>;
  }
}

export function phraseTmsAuthorizationHeader(token: string): string {
  const trimmed = token.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("apitoken ") || lower.startsWith("bearer ")) {
    return trimmed;
  }
  return `ApiToken ${trimmed}`;
}

export function mapPhraseTmsFetcherError(error: unknown) {
  if (error instanceof PhraseTmsApiError && error.status === 401) {
    return new Error("phrase_auth_invalid");
  }

  return error instanceof Error ? error : new Error("phrase_fetch_failed");
}

type PhraseTmsJobsPageApiRecord = {
  content?: PhraseTmsJobPartApiRecord[];
  totalPages?: number;
};

type PhraseTmsWhoAmIApiRecord = {
  user?: {
    id?: string | null;
    uid?: string | null;
    userName?: string | null;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
};

type PhraseTmsJobPartApiRecord = {
  uid: string;
  innerId?: string;
  status?: string;
  targetLang?: string;
  filename?: string;
  dateDue?: string | null;
  dateCreated?: string | null;
  workflowStep?: {
    id?: string | null;
    name?: string | null;
    order?: number | null;
    workflowLevel?: number | null;
  } | null;
  owner?: {
    email?: string | null;
    userName?: string | null;
  } | null;
  importStatus?: {
    status?: string | null;
    errorMessage?: string | null;
  } | null;
};

type PhraseTmsTransMemoriesApiRecord = {
  transMemories?: PhraseTmsResourceApiRecord[];
};

type PhraseTmsTermBasesApiRecord = {
  termBases?: PhraseTmsResourceApiRecord[];
};

type PhraseTmsResourceApiRecord = {
  uid?: string;
  name?: string;
  id?: string | number | null;
};

type PhraseTmsSearchSegmentResponseApiRecord = {
  searchResults?: PhraseTmsSearchSegmentApiRecord[];
};

type PhraseTmsSearchSegmentApiRecord = {
  score?: number;
  segmentId?: string;
  source?: { text?: string; lang?: string };
  translations?: Array<{ text?: string; lang?: string }>;
  transMemory?: { uid?: string; name?: string };
};

type PhraseTmsLqaConversationsApiRecord = {
  conversations?: PhraseTmsConversationApiRecord[];
};

type PhraseTmsPlainConversationsApiRecord = {
  conversations?: PhraseTmsConversationApiRecord[];
};

type PhraseTmsConversationApiRecord = {
  id?: string;
  type?: string;
  lqaDescription?: string;
  deleted?: boolean;
  dateCreated?: string | null;
  dateModified?: string | null;
  dateEdited?: string | null;
  createdBy?: PhraseTmsUserApiRecord | null;
  status?: {
    name?: string;
    date?: string | null;
    by?: PhraseTmsUserApiRecord | null;
  } | null;
  comments?: PhraseTmsCommentApiRecord[];
  references?: {
    segmentId?: string;
    commentedText?: string;
    lqa?: Array<{
      errorCategoryId?: number;
      severityId?: number;
      repeated?: string;
    }>;
  } | null;
};

type PhraseTmsUserApiRecord = {
  uid?: string;
  userName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

type PhraseTmsCommentApiRecord = {
  id?: string;
  text?: string;
  dateCreated?: string | null;
  dateModified?: string | null;
  createdBy?: PhraseTmsUserApiRecord | null;
};

function normalizePhraseTmsSearchSegmentResults(
  results: PhraseTmsSearchSegmentApiRecord[] | undefined,
): PhraseTmsSearchSegmentResult[] {
  if (!results?.length) {
    return [];
  }

  const normalized: PhraseTmsSearchSegmentResult[] = [];

  for (const result of results) {
    const sourceText = result.source?.text?.trim() ?? "";
    if (!sourceText) {
      continue;
    }

    const targetTranslation =
      result.translations?.find((translation) => translation.text?.trim()) ?? null;
    const targetText = targetTranslation?.text?.trim() ?? "";
    if (!targetText) {
      continue;
    }

    normalized.push({
      score: result.score ?? null,
      segmentId: result.segmentId?.trim() || null,
      sourceText,
      targetText,
      targetLocale: targetTranslation?.lang?.trim() || null,
      transMemoryUid: result.transMemory?.uid?.trim() || null,
      transMemoryName: result.transMemory?.name?.trim() || null,
    });
  }

  return normalized;
}

function normalizePhraseTmsJobPart(job: PhraseTmsJobPartApiRecord): PhraseTmsJobPart {
  return {
    uid: job.uid,
    innerId: job.innerId?.trim() || job.uid,
    status: job.status?.trim() || "NEW",
    targetLang: job.targetLang?.trim() || "",
    filename: job.filename?.trim() || "Untitled job",
    dateDue: job.dateDue ?? null,
    dateCreated: job.dateCreated ?? null,
    workflowStep: job.workflowStep
      ? {
          id: job.workflowStep.id ?? null,
          name: job.workflowStep.name ?? null,
          order: job.workflowStep.order ?? null,
          workflowLevel: job.workflowStep.workflowLevel ?? null,
        }
      : null,
    owner: job.owner
      ? {
          email: job.owner.email ?? null,
          userName: job.owner.userName ?? null,
        }
      : null,
    importStatus: job.importStatus
      ? {
          status: job.importStatus.status ?? null,
          errorMessage: job.importStatus.errorMessage ?? null,
        }
      : null,
  };
}

function normalizePhraseTmsConversationUser(
  user: PhraseTmsUserApiRecord | null | undefined,
): PhraseTmsConversationUser | null {
  if (!user) {
    return null;
  }

  const externalUserId = user.uid?.trim() || user.userName?.trim() || null;
  if (!externalUserId) {
    return null;
  }

  return {
    uid: user.uid?.trim() || null,
    userName: user.userName?.trim() || null,
    firstName: user.firstName?.trim() || null,
    lastName: user.lastName?.trim() || null,
    email: user.email?.trim() || null,
  };
}

function mapPhraseTmsConversationState(
  statusName: string | null | undefined,
): PhraseTmsConversation["state"] {
  if (statusName === "resolved") {
    return "resolved";
  }
  if (statusName === "unresolved") {
    return "open";
  }
  return "unknown";
}

function normalizePhraseTmsConversationComment(
  comment: PhraseTmsCommentApiRecord,
): PhraseTmsConversationComment | null {
  const id = comment.id?.trim();
  const text = comment.text?.trim();
  if (!id || !text) {
    return null;
  }

  return {
    id,
    text,
    createdAt: comment.dateCreated ?? null,
    updatedAt: comment.dateModified ?? null,
    author: normalizePhraseTmsConversationUser(comment.createdBy),
  };
}

function normalizePhraseTmsConversationReference(
  references: PhraseTmsConversationApiRecord["references"],
): PhraseTmsLqaConversationReference | null {
  const lqa = references?.lqa?.[0];
  const segmentId = references?.segmentId?.trim() || null;
  const commentedText = references?.commentedText?.trim() || null;

  if (!lqa && !segmentId && !commentedText) {
    return null;
  }

  return {
    segmentId,
    commentedText,
    errorCategoryId: lqa?.errorCategoryId ?? null,
    severityId: lqa?.severityId ?? null,
    repeated: lqa?.repeated ?? null,
  };
}

function normalizePhraseTmsConversation(
  conversation: PhraseTmsConversationApiRecord,
  type: PhraseTmsConversation["type"],
): PhraseTmsConversation {
  const statusName = conversation.status?.name ?? null;

  return {
    id: conversation.id?.trim() || "",
    type,
    description: conversation.lqaDescription?.trim() || null,
    deleted: conversation.deleted ?? false,
    createdAt: conversation.dateCreated ?? null,
    updatedAt: conversation.dateModified ?? conversation.dateEdited ?? null,
    resolvedAt: statusName === "resolved" ? (conversation.status?.date ?? null) : null,
    state: mapPhraseTmsConversationState(statusName),
    author: normalizePhraseTmsConversationUser(conversation.createdBy),
    resolver:
      statusName === "resolved"
        ? normalizePhraseTmsConversationUser(conversation.status?.by)
        : null,
    comments: (conversation.comments ?? [])
      .map((comment) => normalizePhraseTmsConversationComment(comment))
      .filter((comment): comment is PhraseTmsConversationComment => comment != null),
    lqaReference: normalizePhraseTmsConversationReference(conversation.references),
  };
}

function normalizePhraseTmsResourceList(
  resources: PhraseTmsResourceApiRecord[] | undefined,
): PhraseTmsResourceReference[] {
  if (!resources) {
    return [];
  }

  return resources
    .map((resource) => ({
      uid: resource.uid?.trim() || "",
      name: resource.name?.trim() || "",
      id: resource.id == null ? null : String(resource.id),
    }))
    .filter((resource) => resource.uid.length > 0);
}
