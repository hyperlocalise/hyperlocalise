import { FIGMA_OAUTH_MESSAGE_TYPE, type FigmaPageJob, type FigmaSegment } from "./plugin-messages";
import { createPkcePair } from "./pkce";
import { normalizeAppUrl } from "./settings";

const FIGMA_SESSION_HEADER = "X-Hyperlocalise-Figma-Session";
const ORGANIZATION_SLUG_HEADER = "X-Hyperlocalise-Organization-Slug";
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
  organizations: Array<{ slug: string | null; name: string; id: string }>;
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

function sessionHeaders(input: { sealedSession: string; organizationSlug?: string }) {
  return {
    "Content-Type": "application/json",
    [FIGMA_SESSION_HEADER]: input.sealedSession,
    ...(input.organizationSlug ? { [ORGANIZATION_SLUG_HEADER]: input.organizationSlug } : {}),
  };
}

async function readError(response: Response): Promise<ErrorPayload> {
  return ((await response.json().catch(() => null)) as ErrorPayload | null) ?? {};
}

export async function signInWithOAuth(appUrl: string): Promise<{
  sealedSession: string;
  email: string;
}> {
  const pkce = await createPkcePair();
  const authorizeResponse = await fetch(
    apiUrl(
      appUrl,
      `/api/auth/figma/authorize?codeChallenge=${encodeURIComponent(pkce.codeChallenge)}&codeChallengeMethod=S256&state=${encodeURIComponent(pkce.state)}`,
    ),
  );
  const authorizePayload = (await authorizeResponse.json().catch(() => null)) as {
    authorization?: { url?: string };
    error?: string;
    message?: string;
  } | null;

  if (!authorizeResponse.ok || !authorizePayload?.authorization?.url) {
    throw new HyperlocaliseClientError(
      authorizePayload?.error ?? "figma_authorize_failed",
      authorizePayload?.message ?? "Unable to start Hyperlocalise sign-in.",
    );
  }

  const authorizationCode = await openOAuthPopup(
    authorizePayload.authorization.url,
    pkce.state,
    normalizeAppUrl(appUrl),
  );

  const tokenResponse = await fetch(apiUrl(appUrl, "/api/auth/figma/token"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: authorizationCode,
      codeVerifier: pkce.codeVerifier,
    }),
  });
  const tokenPayload = (await tokenResponse.json().catch(() => null)) as {
    session?: { sealedSession?: string };
    user?: { email?: string };
    error?: string;
    message?: string;
  } | null;

  if (!tokenResponse.ok || !tokenPayload?.session?.sealedSession) {
    throw new HyperlocaliseClientError(
      tokenPayload?.error ?? "figma_token_exchange_failed",
      tokenPayload?.message ?? "Unable to finish Hyperlocalise sign-in.",
    );
  }

  return {
    sealedSession: tokenPayload.session.sealedSession,
    email: tokenPayload.user?.email ?? "",
  };
}

function openOAuthPopup(url: string, state: string, appUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const popup = window.open(url, "hyperlocalise-figma-oauth", "width=480,height=720");
    if (!popup) {
      reject(
        new HyperlocaliseClientError("popup_blocked", "Allow popups to sign in to Hyperlocalise."),
      );
      return;
    }

    const timeout = window.setTimeout(
      () => {
        cleanup();
        reject(new HyperlocaliseClientError("oauth_timeout", "Sign-in timed out. Try again."));
      },
      5 * 60 * 1000,
    );

    const handleMessage = (event: MessageEvent) => {
      const origin = typeof event.origin === "string" ? event.origin : "";
      if (origin && origin !== new URL(appUrl).origin) {
        return;
      }

      const data = event.data as {
        type?: string;
        code?: string | null;
        state?: string | null;
        error?: string | null;
        errorDescription?: string | null;
      };
      if (data?.type !== FIGMA_OAUTH_MESSAGE_TYPE) {
        return;
      }
      if (data.state && data.state !== state) {
        return;
      }

      cleanup();
      popup.close();

      if (data.error || !data.code) {
        reject(
          new HyperlocaliseClientError(
            data.error ?? "oauth_denied",
            data.errorDescription ?? "Sign-in was cancelled.",
          ),
        );
        return;
      }

      resolve(data.code);
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    };

    window.addEventListener("message", handleMessage);
  });
}

export async function fetchFigmaSession(input: {
  appUrl: string;
  sealedSession: string;
  organizationSlug?: string;
}): Promise<FigmaSession> {
  const response = await fetch(apiUrl(input.appUrl, "/api/integrations/figma/session"), {
    headers: sessionHeaders(input),
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
  sealedSession: string;
  organizationSlug: string;
}): Promise<FigmaProject[]> {
  const response = await fetch(apiUrl(input.appUrl, "/api/integrations/figma/projects"), {
    headers: sessionHeaders(input),
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
  sealedSession: string;
  organizationSlug: string;
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
    headers: sessionHeaders(input),
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
  sealedSession: string;
  organizationSlug: string;
  jobId: string;
}): Promise<void> {
  const response = await fetch(
    apiUrl(
      input.appUrl,
      `/api/integrations/figma/jobs/${encodeURIComponent(input.jobId)}/generate`,
    ),
    {
      method: "POST",
      headers: sessionHeaders(input),
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
  sealedSession: string;
  organizationSlug: string;
  jobId: string;
}): Promise<FigmaJobStatus> {
  const response = await fetch(
    apiUrl(input.appUrl, `/api/integrations/figma/jobs/${encodeURIComponent(input.jobId)}`),
    { headers: sessionHeaders(input) },
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
  sealedSession: string;
  organizationSlug: string;
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
    { headers: sessionHeaders(input) },
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
  sealedSession: string;
  organizationSlug: string;
  projectId: string;
  fileKey: string;
  pageId: string;
}): Promise<FigmaJobStatus> {
  const response = await fetch(
    apiUrl(
      input.appUrl,
      `/api/integrations/figma/translations?projectId=${encodeURIComponent(input.projectId)}&fileKey=${encodeURIComponent(input.fileKey)}&pageId=${encodeURIComponent(input.pageId)}`,
    ),
    { headers: sessionHeaders(input) },
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
