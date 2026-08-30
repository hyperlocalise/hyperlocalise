import type { FigmaPageJob, FigmaSegment } from "./plugin-messages";
import { normalizeAppUrl } from "./settings";

const API_KEY_HEADER = "x-api-key";
export const FIGMA_JOB_POLL_INTERVAL_MS = 1_500;

export class HyperlocaliseClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "HyperlocaliseClientError";
  }
}

export type FigmaSession = {
  user: { email: string; localUserId: string };
  organization: { slug: string | null; name: string; id: string };
};

export type FigmaProject = {
  id: string;
  name: string;
  sourceLocale: string;
  targetLocales: string[];
};

export type FigmaJobStatus = FigmaPageJob;

type ErrorPayload = { error?: string; message?: string };

function apiUrl(appUrl: string, path: string) {
  return `${normalizeAppUrl(appUrl)}${path}`;
}

function apiKeyHeaders(personalAccessToken: string) {
  return {
    "Content-Type": "application/json",
    [API_KEY_HEADER]: personalAccessToken,
  };
}

async function readError(response: Response): Promise<ErrorPayload> {
  return ((await response.json().catch(() => null)) as ErrorPayload | null) ?? {};
}

export async function fetchFigmaSession(input: {
  appUrl: string;
  personalAccessToken: string;
}): Promise<FigmaSession> {
  const response = await fetch(apiUrl(input.appUrl, "/api/integrations/figma/session"), {
    headers: apiKeyHeaders(input.personalAccessToken),
  });
  const payload = (await response.json().catch(() => null)) as
    | ({
        session?: FigmaSession;
      } & ErrorPayload)
    | null;
  if (!response.ok || !payload?.session) {
    throw new HyperlocaliseClientError(
      payload?.error ?? "figma_session_failed",
      payload?.message ?? "Unable to load your Hyperlocalise session.",
    );
  }
  return payload.session;
}

export async function fetchFigmaProjects(input: {
  appUrl: string;
  personalAccessToken: string;
}): Promise<FigmaProject[]> {
  const response = await fetch(apiUrl(input.appUrl, "/api/integrations/figma/projects"), {
    headers: apiKeyHeaders(input.personalAccessToken),
  });
  const payload = (await response.json().catch(() => null)) as
    | ({
        projects?: FigmaProject[];
      } & ErrorPayload)
    | null;
  if (!response.ok || !payload?.projects) {
    throw new HyperlocaliseClientError(
      payload?.error ?? "figma_projects_failed",
      payload?.message ?? "Unable to load projects.",
    );
  }
  return payload.projects;
}

export async function createFigmaJob(input: {
  appUrl: string;
  personalAccessToken: string;
  projectId: string;
  fileKey: string;
  pageId: string;
  fileName?: string;
  sourceLocale: string;
  targetLocales: string[];
  generate: boolean;
  segments: FigmaSegment[];
}): Promise<{
  jobId: string;
  generated: boolean;
  projectId: string;
  sourcePath: string;
}> {
  const response = await fetch(apiUrl(input.appUrl, "/api/integrations/figma/jobs"), {
    method: "POST",
    headers: apiKeyHeaders(input.personalAccessToken),
    body: JSON.stringify({
      projectId: input.projectId,
      fileKey: input.fileKey,
      pageId: input.pageId,
      fileName: input.fileName,
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales,
      generate: input.generate,
      segments: input.segments,
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | ({
        job?: {
          jobId?: string;
          generated?: boolean;
          projectId?: string;
          sourcePath?: string;
        };
      } & ErrorPayload)
    | null;
  if (!response.ok || !payload?.job?.jobId || !payload.job.projectId || !payload.job.sourcePath) {
    throw new HyperlocaliseClientError(
      payload?.error ?? "figma_job_create_failed",
      payload?.message ?? "Unable to create a translation job.",
    );
  }
  return {
    jobId: payload.job.jobId,
    generated: payload.job.generated ?? input.generate,
    projectId: payload.job.projectId,
    sourcePath: payload.job.sourcePath,
  };
}

export async function generateFigmaJob(input: {
  appUrl: string;
  personalAccessToken: string;
  jobId: string;
}): Promise<void> {
  const response = await fetch(
    apiUrl(
      input.appUrl,
      `/api/integrations/figma/jobs/${encodeURIComponent(input.jobId)}/generate`,
    ),
    {
      method: "POST",
      headers: apiKeyHeaders(input.personalAccessToken),
    },
  );
  if (!response.ok) {
    const payload = await readError(response);
    throw new HyperlocaliseClientError(
      payload.error ?? "figma_job_generate_failed",
      payload.message ?? "Unable to generate translations.",
    );
  }
}

export async function getFigmaJob(input: {
  appUrl: string;
  personalAccessToken: string;
  jobId: string;
}): Promise<FigmaJobStatus> {
  const response = await fetch(
    apiUrl(input.appUrl, `/api/integrations/figma/jobs/${encodeURIComponent(input.jobId)}`),
    { headers: apiKeyHeaders(input.personalAccessToken) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({
        job?: FigmaJobStatus;
      } & ErrorPayload)
    | null;

  if (!response.ok || !payload?.job?.jobId) {
    throw new HyperlocaliseClientError(
      payload?.error ?? "figma_job_poll_failed",
      payload?.message ?? "Unable to check job status.",
    );
  }

  return payload.job;
}

export async function fetchCurrentFigmaJob(input: {
  appUrl: string;
  personalAccessToken: string;
  fileKey: string;
  pageId: string;
  projectId?: string;
}): Promise<FigmaJobStatus | null> {
  const params = new URLSearchParams({
    fileKey: input.fileKey,
    pageId: input.pageId,
  });
  if (input.projectId) {
    params.set("projectId", input.projectId);
  }

  const response = await fetch(
    apiUrl(input.appUrl, `/api/integrations/figma/jobs/current?${params.toString()}`),
    { headers: apiKeyHeaders(input.personalAccessToken) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({
        job?: FigmaJobStatus | null;
      } & ErrorPayload)
    | null;

  if (!response.ok) {
    throw new HyperlocaliseClientError(
      payload?.error ?? "figma_current_job_failed",
      payload?.message ?? "Unable to load the job for this page.",
    );
  }

  return payload?.job ?? null;
}

export async function pullFigmaTranslations(input: {
  appUrl: string;
  personalAccessToken: string;
  projectId: string;
  fileKey: string;
  pageId: string;
}): Promise<FigmaJobStatus> {
  const response = await fetch(
    apiUrl(
      input.appUrl,
      `/api/integrations/figma/translations?projectId=${encodeURIComponent(input.projectId)}&fileKey=${encodeURIComponent(input.fileKey)}&pageId=${encodeURIComponent(input.pageId)}`,
    ),
    { headers: apiKeyHeaders(input.personalAccessToken) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({
        translations?: {
          jobId?: string | null;
          status?: FigmaJobStatus["status"] | "not_found";
          projectId?: string;
          sourcePath?: string;
          targetLocales?: string[];
          lastError?: string | null;
          translationsByLocale?: Record<string, Record<string, string>>;
        };
      } & ErrorPayload)
    | null;

  if (!response.ok || !payload?.translations) {
    throw new HyperlocaliseClientError(
      payload?.error ?? "figma_translations_failed",
      payload?.message ?? "Unable to pull translations.",
    );
  }

  if (payload.translations.status === "not_found" || !payload.translations.jobId) {
    throw new HyperlocaliseClientError(
      "translations_not_found",
      "No job for this page yet. Create a job first.",
    );
  }

  if (payload.translations.status === "queued" || payload.translations.status === "running") {
    throw new HyperlocaliseClientError(
      "translations_not_ready",
      "Translations are still running. Wait until the job is ready, then pull.",
    );
  }

  if (!payload.translations.projectId || !payload.translations.sourcePath) {
    throw new HyperlocaliseClientError("figma_translations_failed", "Unable to pull translations.");
  }

  return {
    jobId: payload.translations.jobId,
    status: payload.translations.status as FigmaJobStatus["status"],
    projectId: payload.translations.projectId,
    sourcePath: payload.translations.sourcePath,
    targetLocales: payload.translations.targetLocales ?? [],
    lastError: payload.translations.lastError ?? null,
    translationsByLocale: payload.translations.translationsByLocale ?? {},
  };
}
