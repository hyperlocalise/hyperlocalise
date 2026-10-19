import type { SanityDocumentJob, SanitySegment } from "./plugin-messages";
import { normalizeAppUrl } from "./settings";

const ACCESS_TOKEN_HEADER = "X-Hyperlocalise-Access-Token";
export const SANITY_JOB_POLL_INTERVAL_MS = 1_500;

export type SanityResourceAuth = {
  accessToken: string;
};

export type SanitySessionProject = {
  id: string;
  name: string;
  sourceLocale: string;
  targetLocales: string[];
};

export type SanitySession = {
  organization: { id: string; name: string; slug: string | null };
  projects: SanitySessionProject[];
  connection: {
    id: string;
    displayName: string;
  };
};

export type SanityJobStatus = SanityDocumentJob;

export class HyperlocaliseClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "HyperlocaliseClientError";
  }
}

type ErrorPayload = { error?: string; message?: string };

function apiUrl(appUrl: string, path: string) {
  return `${normalizeAppUrl(appUrl)}${path}`;
}

function buildRequestHeaders(_appUrl: string, auth: SanityResourceAuth) {
  return {
    "Content-Type": "application/json",
    [ACCESS_TOKEN_HEADER]: auth.accessToken,
  };
}

async function readError(response: Response): Promise<ErrorPayload> {
  return ((await response.json().catch(() => null)) as ErrorPayload | null) ?? {};
}

function throwIfFailed(
  response: Response,
  payload: ErrorPayload | null,
  fallbackCode: string,
  fallbackMessage: string,
) {
  if (response.ok) {
    return;
  }
  throw new HyperlocaliseClientError(
    payload?.error ?? fallbackCode,
    payload?.message ?? fallbackMessage,
  );
}

export function resourceAuthFromSettings(input: {
  accessToken?: string | null;
}): SanityResourceAuth | null {
  const accessToken = input.accessToken?.trim();
  if (!accessToken) {
    return null;
  }
  return { accessToken };
}

export async function fetchSanitySession(input: {
  appUrl: string;
  auth: SanityResourceAuth;
}): Promise<SanitySession> {
  const response = await fetch(apiUrl(input.appUrl, "/api/integrations/sanity/session"), {
    headers: buildRequestHeaders(input.appUrl, input.auth),
  });
  const payload = (await response.json().catch(() => null)) as
    | ({ session?: SanitySession } & ErrorPayload)
    | null;
  throwIfFailed(
    response,
    payload,
    "sanity_session_failed",
    "Unable to load your Hyperlocalise session.",
  );
  if (!payload?.session) {
    throw new HyperlocaliseClientError(
      "sanity_session_failed",
      "Unable to load your Hyperlocalise session.",
    );
  }
  return payload.session;
}

export async function collectSanityDocument(input: {
  appUrl: string;
  auth: SanityResourceAuth;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  documentId: string;
  documentType: string;
  documentTitle?: string;
  segments: SanitySegment[];
}): Promise<{
  projectId: string;
  sourceFileId: string;
  sourcePath: string;
  segmentCount: number;
}> {
  const response = await fetch(apiUrl(input.appUrl, "/api/integrations/sanity/collect"), {
    method: "POST",
    headers: buildRequestHeaders(input.appUrl, input.auth),
    body: JSON.stringify({
      projectId: input.projectId,
      sanityProjectId: input.sanityProjectId,
      dataset: input.dataset,
      documentId: input.documentId,
      documentType: input.documentType,
      documentTitle: input.documentTitle,
      segments: input.segments,
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | ({
        projectId?: string;
        sourceFileId?: string;
        sourcePath?: string;
        segmentCount?: number;
      } & ErrorPayload)
    | null;
  throwIfFailed(response, payload, "sanity_collect_failed", "Unable to upload page text.");
  if (!payload?.projectId || !payload.sourceFileId || !payload.sourcePath) {
    throw new HyperlocaliseClientError("sanity_collect_failed", "Unable to upload page text.");
  }
  return {
    projectId: payload.projectId,
    sourceFileId: payload.sourceFileId,
    sourcePath: payload.sourcePath,
    segmentCount: payload.segmentCount ?? 0,
  };
}

export async function createSanityJob(input: {
  appUrl: string;
  auth: SanityResourceAuth;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  documentId: string;
  documentType: string;
  documentTitle?: string;
  sourceLocale: string;
  targetLocales: string[];
  segments?: SanitySegment[];
  generate: boolean;
}): Promise<{ jobId: string; generated: boolean; projectId: string; sourcePath: string }> {
  const response = await fetch(apiUrl(input.appUrl, "/api/integrations/sanity/jobs"), {
    method: "POST",
    headers: buildRequestHeaders(input.appUrl, input.auth),
    body: JSON.stringify({
      projectId: input.projectId,
      documents: [
        {
          sanityProjectId: input.sanityProjectId,
          dataset: input.dataset,
          documentId: input.documentId,
          documentType: input.documentType,
          documentTitle: input.documentTitle,
          segments: input.segments,
        },
      ],
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales,
      generate: input.generate,
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | ({
        job?: { jobId: string; generated: boolean; projectId: string; sourcePath: string };
      } & ErrorPayload)
    | null;
  throwIfFailed(response, payload, "sanity_job_create_failed", "Unable to start translation.");
  if (!payload?.job) {
    throw new HyperlocaliseClientError("sanity_job_create_failed", "Unable to start translation.");
  }
  return payload.job;
}

export type SanityLocaleDocumentStatusResponse = {
  documentId: string;
  status: SanityDocumentJob["status"] | "missing" | "idle";
};

export type SanityLocaleStatusResponse = {
  locale: string;
  isSource: boolean;
  documents: SanityLocaleDocumentStatusResponse[];
};

export async function fetchSanityLocaleStatusesFromApi(input: {
  appUrl: string;
  auth: SanityResourceAuth;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  documentIds: string[];
}): Promise<{ locales: SanityLocaleStatusResponse[]; documents: unknown[] }> {
  const params = new URLSearchParams({
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
    documentIds: input.documentIds.join(","),
    projectId: input.projectId,
  });
  const response = await fetch(
    apiUrl(input.appUrl, `/api/integrations/sanity/locales?${params.toString()}`),
    { headers: buildRequestHeaders(input.appUrl, input.auth) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({ locales?: SanityLocaleStatusResponse[]; documents?: unknown[] } & ErrorPayload)
    | null;
  throwIfFailed(response, payload, "sanity_locales_failed", "Unable to load locale status.");
  if (!payload?.locales) {
    throw new HyperlocaliseClientError("sanity_locales_failed", "Unable to load locale status.");
  }
  return { locales: payload.locales, documents: payload.documents ?? [] };
}

export async function fetchCurrentSanityJob(input: {
  appUrl: string;
  auth: SanityResourceAuth;
  fileKey: string;
  pageId: string;
  projectId: string;
}): Promise<{ job: SanityDocumentJob | null }> {
  const params = new URLSearchParams({
    fileKey: input.fileKey,
    pageId: input.pageId,
  });
  const projectId = input.projectId.trim();
  if (projectId) {
    params.set("projectId", projectId);
  }
  const response = await fetch(
    apiUrl(input.appUrl, `/api/integrations/sanity/jobs/current?${params.toString()}`),
    { headers: buildRequestHeaders(input.appUrl, input.auth) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({ job?: SanityDocumentJob | null } & ErrorPayload)
    | null;
  throwIfFailed(response, payload, "sanity_job_fetch_failed", "Unable to load the current job.");
  return { job: payload?.job ?? null };
}

export async function getSanityJob(input: {
  appUrl: string;
  auth: SanityResourceAuth;
  jobId: string;
}): Promise<SanityDocumentJob> {
  const response = await fetch(
    apiUrl(input.appUrl, `/api/integrations/sanity/jobs/${encodeURIComponent(input.jobId)}`),
    { headers: buildRequestHeaders(input.appUrl, input.auth) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({ job?: SanityDocumentJob } & ErrorPayload)
    | null;
  throwIfFailed(response, payload, "sanity_job_fetch_failed", "Unable to load the job.");
  if (!payload?.job) {
    throw new HyperlocaliseClientError("sanity_job_fetch_failed", "Unable to load the job.");
  }
  return payload.job;
}

export async function generateSanityLocaleJob(input: {
  appUrl: string;
  auth: SanityResourceAuth;
  projectId: string;
  fileKey: string;
  pageId: string;
  sourceLocale: string;
  targetLocales: string[];
}): Promise<{ jobId: string; generated: boolean; projectId: string; sourcePath: string }> {
  return createSanityJob({
    ...input,
    generate: true,
  });
}

export async function generateSanityJob(input: {
  appUrl: string;
  auth: SanityResourceAuth;
  jobId: string;
}): Promise<void> {
  const response = await fetch(
    apiUrl(
      input.appUrl,
      `/api/integrations/sanity/jobs/${encodeURIComponent(input.jobId)}/generate`,
    ),
    { method: "POST", headers: buildRequestHeaders(input.appUrl, input.auth) },
  );
  const payload = await readError(response);
  throwIfFailed(response, payload, "sanity_job_generate_failed", "Unable to generate translations.");
}

export type SanityPullTranslationsPayload = SanityDocumentJob | Record<string, Record<string, string>>;

export function isSanityDocumentJobPayload(value: unknown): value is SanityDocumentJob {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as SanityDocumentJob;
  return (
    typeof candidate.jobId === "string" &&
    typeof candidate.projectId === "string" &&
    candidate.translationsByLocale !== undefined &&
    typeof candidate.translationsByLocale === "object"
  );
}

function isLocaleTranslationMap(value: unknown): value is Record<string, Record<string, string>> {
  if (!value || typeof value !== "object" || isSanityDocumentJobPayload(value)) {
    return false;
  }
  if ("jobId" in value && (value as { jobId: unknown }).jobId === null) {
    return false;
  }
  return Object.values(value).every(
    (entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry),
  );
}

export type SanitySourcePullPagePayload = {
  locale: string;
  sourcePath: string;
  needsReupload: boolean;
  entries: Array<{ key: string; source: string; knownTexts: string[] }>;
};

export async function pullSanitySourcePage(input: {
  appUrl: string;
  auth: SanityResourceAuth;
  projectId: string;
  fileKey: string;
  pageId: string;
  locale: string;
}): Promise<SanitySourcePullPagePayload> {
  const params = new URLSearchParams({
    projectId: input.projectId,
    fileKey: input.fileKey,
    pageId: input.pageId,
    locale: input.locale,
  });
  const response = await fetch(
    apiUrl(input.appUrl, `/api/integrations/sanity/translations?${params.toString()}`),
    { headers: buildRequestHeaders(input.appUrl, input.auth) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({ sourcePage?: SanitySourcePullPagePayload } & ErrorPayload)
    | null;
  throwIfFailed(response, payload, "sanity_source_pull_failed", "Unable to load source text.");
  if (!payload?.sourcePage) {
    throw new Error("Unable to load source text.");
  }
  return payload.sourcePage;
}

export async function pullSanityTranslations(input: {
  appUrl: string;
  auth: SanityResourceAuth;
  projectId: string;
  fileKey: string;
  pageId: string;
  locale?: string;
}): Promise<SanityPullTranslationsPayload> {
  const params = new URLSearchParams({
    projectId: input.projectId,
    fileKey: input.fileKey,
    pageId: input.pageId,
  });
  const locale = input.locale?.trim();
  if (locale) {
    params.set("locale", locale);
  }
  const response = await fetch(
    apiUrl(input.appUrl, `/api/integrations/sanity/translations?${params.toString()}`),
    { headers: buildRequestHeaders(input.appUrl, input.auth) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({ translations?: SanityPullTranslationsPayload } & ErrorPayload)
    | null;
  throwIfFailed(response, payload, "sanity_translations_failed", "Unable to load translations.");
  const translations = payload?.translations;
  if (
    translations &&
    typeof translations === "object" &&
    "jobId" in translations &&
    translations.jobId === null
  ) {
    throw new Error("No translations found for this page.");
  }
  if (isSanityDocumentJobPayload(translations)) {
    return translations;
  }
  if (isLocaleTranslationMap(translations)) {
    return translations;
  }
  throw new Error("Unable to load translations.");
}
