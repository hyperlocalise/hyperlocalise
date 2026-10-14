import type { FigmaPageJob, FigmaSegment } from "./plugin-messages";
import { normalizeAppUrl } from "./settings";

const ACCESS_TOKEN_HEADER = "X-Hyperlocalise-Access-Token";
const CONNECTION_TOKEN_HEADER = "X-Hyperlocalise-Connection-Token";
export const FIGMA_JOB_POLL_INTERVAL_MS = 1_500;

export type FigmaResourceAuth = {
  accessToken?: string;
  connectionToken?: string;
};

export type FigmaSessionProject = {
  id: string;
  name: string;
  sourceLocale: string;
  targetLocales: string[];
};

export type FigmaSession = {
  organization: { id: string; name: string; slug: string | null };
  project: FigmaSessionProject | null;
  projects: FigmaSessionProject[];
  connection: {
    id: string;
    displayName: string;
    sourceLocale: string;
    targetLocales: string[];
  };
};

export type FigmaJobStatus = FigmaPageJob;

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

function normalizeResourceAuth(auth: string | FigmaResourceAuth): FigmaResourceAuth {
  return typeof auth === "string" ? { connectionToken: auth } : auth;
}

function buildRequestHeaders(appUrl: string, auth: string | FigmaResourceAuth) {
  const resourceAuth = normalizeResourceAuth(auth);
  return {
    "Content-Type": "application/json",
    ...(resourceAuth.accessToken ? { [ACCESS_TOKEN_HEADER]: resourceAuth.accessToken } : {}),
    ...(resourceAuth.connectionToken
      ? { [CONNECTION_TOKEN_HEADER]: resourceAuth.connectionToken }
      : {}),
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
  connectionToken?: string | null;
}): FigmaResourceAuth | null {
  const accessToken = input.accessToken?.trim();
  const connectionToken = input.connectionToken?.trim();
  if (accessToken) {
    return { accessToken };
  }
  if (connectionToken) {
    return { connectionToken };
  }
  return null;
}

export async function fetchFigmaSession(input: {
  appUrl: string;
  auth: string | FigmaResourceAuth;
}): Promise<FigmaSession> {
  const response = await fetch(apiUrl(input.appUrl, "/api/integrations/figma/session"), {
    headers: buildRequestHeaders(input.appUrl, input.auth),
  });
  const payload = (await response.json().catch(() => null)) as
    | ({ session?: FigmaSession } & ErrorPayload)
    | null;
  throwIfFailed(
    response,
    payload,
    "figma_session_failed",
    "Unable to load your Hyperlocalise session.",
  );
  if (!payload?.session) {
    throw new HyperlocaliseClientError(
      "figma_session_failed",
      "Unable to load your Hyperlocalise session.",
    );
  }
  return payload.session;
}

export async function bindFigmaProject(input: {
  appUrl: string;
  auth: string | FigmaResourceAuth;
  projectId: string;
}): Promise<FigmaSession> {
  const response = await fetch(apiUrl(input.appUrl, "/api/integrations/figma/project"), {
    method: "POST",
    headers: buildRequestHeaders(input.appUrl, input.auth),
    body: JSON.stringify({ projectId: input.projectId }),
  });
  const payload = (await response.json().catch(() => null)) as
    | ({ session?: FigmaSession } & ErrorPayload)
    | null;
  throwIfFailed(
    response,
    payload,
    "figma_project_bind_failed",
    "Unable to select that Hyperlocalise project.",
  );
  if (!payload?.session) {
    throw new HyperlocaliseClientError(
      "figma_project_bind_failed",
      "Unable to select that Hyperlocalise project.",
    );
  }
  return payload.session;
}

export async function createFigmaJob(input: {
  appUrl: string;
  auth: string | FigmaResourceAuth;
  projectId: string;
  fileKey: string;
  pageId: string;
  fileName?: string;
  pageName?: string;
  sourceLocale: string;
  targetLocales: string[];
  segments: FigmaSegment[];
  generate: boolean;
}): Promise<{ jobId: string; generated: boolean; projectId: string; sourcePath: string }> {
  const response = await fetch(apiUrl(input.appUrl, "/api/integrations/figma/jobs"), {
    method: "POST",
    headers: buildRequestHeaders(input.appUrl, input.auth),
    body: JSON.stringify({
      projectId: input.projectId,
      fileKey: input.fileKey,
      pageId: input.pageId,
      fileName: input.fileName,
      pageName: input.pageName,
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales,
      segments: input.segments.map((segment) => ({
        key: segment.key,
        nodeId: segment.nodeId,
        regionIndex: segment.regionIndex,
        text: segment.text,
      })),
      generate: input.generate,
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | ({
        job?: { jobId: string; generated: boolean; projectId: string; sourcePath: string };
      } & ErrorPayload)
    | null;
  throwIfFailed(response, payload, "figma_job_create_failed", "Unable to start translation.");
  if (!payload?.job) {
    throw new HyperlocaliseClientError("figma_job_create_failed", "Unable to start translation.");
  }
  return payload.job;
}

export async function fetchCurrentFigmaJob(input: {
  appUrl: string;
  auth: string | FigmaResourceAuth;
  fileKey: string;
  pageId: string;
  projectId: string;
}): Promise<{ job: FigmaPageJob | null }> {
  const params = new URLSearchParams({
    fileKey: input.fileKey,
    pageId: input.pageId,
  });
  const projectId = input.projectId.trim();
  if (projectId) {
    params.set("projectId", projectId);
  }
  const response = await fetch(
    apiUrl(input.appUrl, `/api/integrations/figma/jobs/current?${params.toString()}`),
    { headers: buildRequestHeaders(input.appUrl, input.auth) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({ job?: FigmaPageJob | null } & ErrorPayload)
    | null;
  throwIfFailed(response, payload, "figma_job_fetch_failed", "Unable to load the current job.");
  return { job: payload?.job ?? null };
}

export async function getFigmaJob(input: {
  appUrl: string;
  auth: string | FigmaResourceAuth;
  jobId: string;
}): Promise<FigmaPageJob> {
  const response = await fetch(
    apiUrl(input.appUrl, `/api/integrations/figma/jobs/${encodeURIComponent(input.jobId)}`),
    { headers: buildRequestHeaders(input.appUrl, input.auth) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({ job?: FigmaPageJob } & ErrorPayload)
    | null;
  throwIfFailed(response, payload, "figma_job_fetch_failed", "Unable to load the job.");
  if (!payload?.job) {
    throw new HyperlocaliseClientError("figma_job_fetch_failed", "Unable to load the job.");
  }
  return payload.job;
}

export async function generateFigmaJob(input: {
  appUrl: string;
  auth: string | FigmaResourceAuth;
  jobId: string;
}): Promise<void> {
  const response = await fetch(
    apiUrl(
      input.appUrl,
      `/api/integrations/figma/jobs/${encodeURIComponent(input.jobId)}/generate`,
    ),
    { method: "POST", headers: buildRequestHeaders(input.appUrl, input.auth) },
  );
  const payload = await readError(response);
  throwIfFailed(response, payload, "figma_job_generate_failed", "Unable to generate translations.");
}

export type FigmaPullTranslationsPayload = FigmaPageJob | Record<string, Record<string, string>>;

export function isFigmaPageJobPayload(value: unknown): value is FigmaPageJob {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as FigmaPageJob;
  return (
    typeof candidate.jobId === "string" &&
    typeof candidate.projectId === "string" &&
    candidate.translationsByLocale !== undefined &&
    typeof candidate.translationsByLocale === "object"
  );
}

function isLocaleTranslationMap(value: unknown): value is Record<string, Record<string, string>> {
  if (!value || typeof value !== "object" || isFigmaPageJobPayload(value)) {
    return false;
  }
  if ("jobId" in value && (value as { jobId: unknown }).jobId === null) {
    return false;
  }
  return Object.values(value).every(
    (entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry),
  );
}

export type FigmaSourcePullPagePayload = {
  locale: string;
  sourcePath: string;
  needsReupload: boolean;
  entries: Array<{ key: string; source: string; knownTexts: string[] }>;
};

export async function pullFigmaSourcePage(input: {
  appUrl: string;
  auth: string | FigmaResourceAuth;
  projectId: string;
  fileKey: string;
  pageId: string;
  locale: string;
}): Promise<FigmaSourcePullPagePayload> {
  const params = new URLSearchParams({
    projectId: input.projectId,
    fileKey: input.fileKey,
    pageId: input.pageId,
    locale: input.locale,
  });
  const response = await fetch(
    apiUrl(input.appUrl, `/api/integrations/figma/translations?${params.toString()}`),
    { headers: buildRequestHeaders(input.appUrl, input.auth) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({ sourcePage?: FigmaSourcePullPagePayload } & ErrorPayload)
    | null;
  throwIfFailed(response, payload, "figma_source_pull_failed", "Unable to load source text.");
  if (!payload?.sourcePage) {
    throw new Error("Unable to load source text.");
  }
  return payload.sourcePage;
}

export async function pullFigmaTranslations(input: {
  appUrl: string;
  auth: string | FigmaResourceAuth;
  projectId: string;
  fileKey: string;
  pageId: string;
}): Promise<FigmaPullTranslationsPayload> {
  const params = new URLSearchParams({
    projectId: input.projectId,
    fileKey: input.fileKey,
    pageId: input.pageId,
  });
  const response = await fetch(
    apiUrl(input.appUrl, `/api/integrations/figma/translations?${params.toString()}`),
    { headers: buildRequestHeaders(input.appUrl, input.auth) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({ translations?: FigmaPullTranslationsPayload } & ErrorPayload)
    | null;
  throwIfFailed(response, payload, "figma_translations_failed", "Unable to load translations.");
  const translations = payload?.translations;
  if (
    translations &&
    typeof translations === "object" &&
    "jobId" in translations &&
    translations.jobId === null
  ) {
    throw new Error("No translations found for this page.");
  }
  if (isFigmaPageJobPayload(translations)) {
    return translations;
  }
  if (isLocaleTranslationMap(translations)) {
    return translations;
  }
  throw new Error("Unable to load translations.");
}
