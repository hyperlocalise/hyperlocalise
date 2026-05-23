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

export interface PhraseTmsTermBaseSearchResult {
  termBaseUid: string | null;
  termBaseName: string | null;
  sourceTerm: string;
  targetTerm: string;
  targetLocale: string | null;
  description: string | null;
  forbidden: boolean | null;
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

  async searchJobTermBasesInText(input: {
    projectUid: string;
    jobUid: string;
    text: string;
  }): Promise<PhraseTmsTermBaseSearchResult[]> {
    const path = `/api2/v1/projects/${encodeURIComponent(input.projectUid)}/jobs/${encodeURIComponent(input.jobUid)}/termBases/searchInTextByJob`;
    const response = await this.post<PhraseTmsTermBaseSearchResponseApiRecord>(path, {
      text: input.text,
    });
    return normalizePhraseTmsTermBaseSearchResults(response.terms);
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
    const response = await this.fetchFn(url, init);

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

type PhraseTmsTermBaseSearchResponseApiRecord = {
  terms?: PhraseTmsTermBaseSearchApiRecord[];
};

type PhraseTmsTermBaseSearchApiRecord = {
  termBase?: { uid?: string; name?: string };
  sourceTerm?: { text?: string };
  targetTerms?: Array<{ text?: string; lang?: string; forbidden?: boolean }>;
  description?: string;
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

function normalizePhraseTmsTermBaseSearchResults(
  terms: PhraseTmsTermBaseSearchApiRecord[] | undefined,
): PhraseTmsTermBaseSearchResult[] {
  if (!terms?.length) {
    return [];
  }

  const normalized: PhraseTmsTermBaseSearchResult[] = [];

  for (const term of terms) {
    const sourceTerm = term.sourceTerm?.text?.trim() ?? "";
    if (!sourceTerm) {
      continue;
    }

    const targetTermRecord =
      term.targetTerms?.find((target) => target.text?.trim()) ?? term.targetTerms?.[0];
    const targetTerm = targetTermRecord?.text?.trim() ?? "";
    if (!targetTerm) {
      continue;
    }

    normalized.push({
      termBaseUid: term.termBase?.uid?.trim() || null,
      termBaseName: term.termBase?.name?.trim() || null,
      sourceTerm,
      targetTerm,
      targetLocale: targetTermRecord?.lang?.trim() || null,
      description: term.description?.trim() || null,
      forbidden: targetTermRecord?.forbidden ?? null,
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
