/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type {
  CanvaDesignJob,
  CanvaLocalePullResult,
  CanvaLocaleStatus,
  CanvaSession,
  CollectedCanvaPage,
  DesignSegment,
} from "./types";

declare const BACKEND_HOST: string;

const ACCESS_TOKEN_HEADER = "X-Hyperlocalise-Access-Token";
const CONNECTION_TOKEN_HEADER = "X-Hyperlocalise-Connection-Token";
const CLAIM_TOKEN_HEADER = "X-Hyperlocalise-Claim-Token";
export const CANVA_JOB_POLL_INTERVAL_MS = 1_500;
export const CANVA_JOB_WAIT_TIMEOUT_MS = 5 * 60 * 1_000;
const READY_JOB_STATUSES = new Set(["succeeded", "waiting_for_review"]);
const FAILED_JOB_STATUSES = new Set(["failed", "cancelled"]);
const CLAIM_POLL_INTERVAL_MS = 1_500;
const MAX_CLAIM_POLL_ATTEMPTS = 80;

export type CanvaResourceAuth = {
  accessToken?: string;
  connectionToken?: string;
};

export class HyperlocaliseClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "HyperlocaliseClientError";
  }
}

type ErrorPayload = { error?: string; message?: string };

async function getCanvaUserModule() {
  return import("@canva/user");
}

async function getAuthorizationHeader(): Promise<string | undefined> {
  try {
    const { auth } = await getCanvaUserModule();
    const token = await auth.getCanvaUserToken();
    return `Bearer ${token}`;
  } catch {
    return undefined;
  }
}

function normalizeResourceAuth(auth: string | CanvaResourceAuth): CanvaResourceAuth {
  return typeof auth === "string" ? { connectionToken: auth } : auth;
}

function buildRequestHeaders(auth: string | CanvaResourceAuth, authorization?: string) {
  const resourceAuth = normalizeResourceAuth(auth);
  return {
    "Content-Type": "application/json",
    ...(resourceAuth.accessToken ? { [ACCESS_TOKEN_HEADER]: resourceAuth.accessToken } : {}),
    ...(resourceAuth.connectionToken
      ? { [CONNECTION_TOKEN_HEADER]: resourceAuth.connectionToken }
      : {}),
    ...(authorization ? { Authorization: authorization } : {}),
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

export async function getHyperlocaliseAccessToken(): Promise<string | null> {
  try {
    const { auth } = await getCanvaUserModule();
    const token = await auth.initOauth().getAccessToken();
    return token?.token ?? null;
  } catch {
    return null;
  }
}

export async function requestHyperlocaliseAuthorization(): Promise<"completed" | "aborted"> {
  const { auth } = await getCanvaUserModule();
  const response = await auth.initOauth().requestAuthorization();
  return response.status === "completed" ? "completed" : "aborted";
}

export async function deauthorizeHyperlocalise(): Promise<void> {
  try {
    const { auth } = await getCanvaUserModule();
    await auth.initOauth().deauthorize();
  } catch {
    // Local development and tests may not have a Canva OAuth session.
  }
}

export async function createCanvaClaim(): Promise<{
  claimId: string;
  pollToken: string;
  authorizeUrl: string;
  expiresAt: string;
}> {
  const response = await fetch(`${BACKEND_HOST}/api/integrations/canva/claims`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const payload = (await response.json().catch(() => null)) as
    | ({
        claimId?: string;
        pollToken?: string;
        authorizeUrl?: string;
        expiresAt?: string;
      } & ErrorPayload)
    | null;
  if (!response.ok || !payload?.claimId || !payload.pollToken || !payload.authorizeUrl) {
    throw new HyperlocaliseClientError(
      payload?.error ?? "canva_claim_create_failed",
      payload?.message ?? "Unable to start a Canva connection.",
    );
  }
  return {
    claimId: payload.claimId,
    pollToken: payload.pollToken,
    authorizeUrl: payload.authorizeUrl,
    expiresAt: payload.expiresAt ?? "",
  };
}

export async function pollCanvaClaim(input: {
  claimId: string;
  pollToken: string;
}): Promise<string> {
  for (let attempt = 0; attempt < MAX_CLAIM_POLL_ATTEMPTS; attempt += 1) {
    const response = await fetch(
      `${BACKEND_HOST}/api/integrations/canva/claims/${encodeURIComponent(input.claimId)}`,
      {
        headers: {
          [CLAIM_TOKEN_HEADER]: input.pollToken,
        },
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | ({
          status?: string;
          connectionToken?: string;
        } & ErrorPayload)
      | null;

    if (!response.ok || !payload) {
      throw new HyperlocaliseClientError(
        payload?.error ?? "canva_claim_poll_failed",
        payload?.message ?? "Unable to check the Canva connection request.",
      );
    }

    if (payload.status === "authorized" && payload.connectionToken) {
      return payload.connectionToken;
    }
    if (payload.status === "expired" || payload.status === "consumed") {
      throw new HyperlocaliseClientError(
        "canva_claim_expired",
        "This connect request expired. Start again from Canva.",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, CLAIM_POLL_INTERVAL_MS));
  }

  throw new HyperlocaliseClientError(
    "canva_claim_timed_out",
    "Timed out waiting for Hyperlocalise authorization.",
  );
}

export async function fetchCanvaSession(auth: string | CanvaResourceAuth): Promise<CanvaSession> {
  const authorization = await getAuthorizationHeader();
  const response = await fetch(`${BACKEND_HOST}/api/integrations/canva/session`, {
    headers: buildRequestHeaders(auth, authorization),
  });
  const payload = (await response.json().catch(() => null)) as
    | ({ session?: CanvaSession } & ErrorPayload)
    | null;
  throwIfFailed(
    response,
    payload,
    "canva_session_failed",
    "Unable to load your Hyperlocalise session.",
  );
  if (!payload?.session) {
    throw new HyperlocaliseClientError(
      "canva_session_failed",
      "Unable to load your Hyperlocalise session.",
    );
  }
  return payload.session;
}

export async function bindCanvaProject(input: {
  auth: string | CanvaResourceAuth;
  projectId: string;
}): Promise<CanvaSession> {
  const authorization = await getAuthorizationHeader();
  const response = await fetch(`${BACKEND_HOST}/api/integrations/canva/project`, {
    method: "POST",
    headers: buildRequestHeaders(input.auth, authorization),
    body: JSON.stringify({ projectId: input.projectId }),
  });
  const payload = (await response.json().catch(() => null)) as
    | ({ session?: CanvaSession } & ErrorPayload)
    | null;
  throwIfFailed(
    response,
    payload,
    "canva_project_bind_failed",
    "Unable to select that Hyperlocalise project.",
  );
  if (!payload?.session) {
    throw new HyperlocaliseClientError(
      "canva_project_bind_failed",
      "Unable to select that Hyperlocalise project.",
    );
  }
  return payload.session;
}

export async function collectCanvaDesign(input: {
  auth: string | CanvaResourceAuth;
  designToken: string;
  designTitle?: string;
  segments: DesignSegment[];
}): Promise<{ designSlug: string; projectId: string; pages: CollectedCanvaPage[] }> {
  const authorization = await getAuthorizationHeader();
  const response = await fetch(`${BACKEND_HOST}/api/integrations/canva/collect`, {
    method: "POST",
    headers: buildRequestHeaders(input.auth, authorization),
    body: JSON.stringify({
      designToken: input.designToken,
      designTitle: input.designTitle,
      segments: input.segments,
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | ({
        designSlug?: string;
        projectId?: string;
        pages?: CollectedCanvaPage[];
      } & ErrorPayload)
    | null;
  if (!response.ok || !payload?.designSlug || !payload.projectId || !payload.pages) {
    throw new HyperlocaliseClientError(
      payload?.error ?? "canva_collect_failed",
      payload?.message ?? "Unable to collect design text.",
    );
  }
  return {
    designSlug: payload.designSlug,
    projectId: payload.projectId,
    pages: payload.pages,
  };
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForCanvaJobs(input: {
  auth: string | CanvaResourceAuth;
  jobIds: string[];
  onProgress?: (completed: number, total: number) => void;
}): Promise<void> {
  const pending = new Set(input.jobIds.filter((jobId) => jobId.trim().length > 0));
  if (pending.size === 0) {
    throw new HyperlocaliseClientError(
      "canva_job_create_failed",
      "No translation jobs were started.",
    );
  }

  const total = pending.size;
  const reportProgress = () => input.onProgress?.(total - pending.size, total);
  reportProgress();

  const startedAt = Date.now();
  while (pending.size > 0) {
    if (Date.now() - startedAt > CANVA_JOB_WAIT_TIMEOUT_MS) {
      throw new HyperlocaliseClientError(
        "canva_job_timeout",
        "Translation is taking too long. Try Apply when the job finishes.",
      );
    }

    for (const jobId of Array.from(pending)) {
      const job = await getCanvaJob({
        auth: input.auth,
        jobId,
      });
      if (FAILED_JOB_STATUSES.has(job.status)) {
        throw new HyperlocaliseClientError(
          "canva_job_failed",
          job.lastError ?? "Translation failed.",
        );
      }
      if (READY_JOB_STATUSES.has(job.status)) {
        pending.delete(jobId);
        reportProgress();
      }
    }

    if (pending.size > 0) {
      await wait(CANVA_JOB_POLL_INTERVAL_MS);
    }
  }
}

export async function generateCanvaLocaleJob(input: {
  auth: string | CanvaResourceAuth;
  designToken: string;
  locale: string;
}): Promise<{ locale: string; projectId: string; jobIds: string[] }> {
  const authorization = await getAuthorizationHeader();
  const response = await fetch(`${BACKEND_HOST}/api/integrations/canva/jobs`, {
    method: "POST",
    headers: buildRequestHeaders(input.auth, authorization),
    body: JSON.stringify({
      designToken: input.designToken,
      targetLocales: [input.locale],
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | ({
        jobs?: { locale?: string; projectId?: string; jobIds?: string[] };
      } & ErrorPayload)
    | null;
  if (!response.ok || !payload?.jobs?.jobIds || !payload.jobs.projectId) {
    throw new HyperlocaliseClientError(
      payload?.error ?? "canva_job_create_failed",
      payload?.message ?? "Unable to generate translations.",
    );
  }
  return {
    locale: payload.jobs.locale ?? input.locale,
    projectId: payload.jobs.projectId,
    jobIds: payload.jobs.jobIds,
  };
}

export async function fetchCanvaLocaleStatuses(input: {
  auth: string | CanvaResourceAuth;
  designToken: string;
}): Promise<{ locales: CanvaLocaleStatus[]; pages: CollectedCanvaPage[]; designId?: string }> {
  const authorization = await getAuthorizationHeader();
  const params = new URLSearchParams({ designToken: input.designToken });
  const response = await fetch(
    `${BACKEND_HOST}/api/integrations/canva/locales?${params.toString()}`,
    { headers: buildRequestHeaders(input.auth, authorization) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({
        locales?: CanvaLocaleStatus[];
        pages?: CollectedCanvaPage[];
        designId?: string;
      } & ErrorPayload)
    | null;
  if (!response.ok || !payload?.locales) {
    throw new HyperlocaliseClientError(
      payload?.error ?? "canva_locales_failed",
      payload?.message ?? "Unable to load locale status.",
    );
  }
  return {
    locales: payload.locales,
    pages: payload.pages ?? [],
    designId: payload.designId,
  };
}

export async function pullCanvaLocalePages(input: {
  auth: string | CanvaResourceAuth;
  designToken: string;
  locale: string;
  pageIndex?: number;
}): Promise<CanvaLocalePullResult> {
  const authorization = await getAuthorizationHeader();
  const params = new URLSearchParams({
    designToken: input.designToken,
    locale: input.locale,
  });
  if (input.pageIndex != null) {
    params.set("pageIndex", String(input.pageIndex));
  }
  const response = await fetch(
    `${BACKEND_HOST}/api/integrations/canva/translations?${params.toString()}`,
    { headers: buildRequestHeaders(input.auth, authorization) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({
        translations?: CanvaLocalePullResult;
      } & ErrorPayload)
    | null;
  if (!response.ok || !payload?.translations?.pages) {
    throw new HyperlocaliseClientError(
      payload?.error ?? "canva_translations_failed",
      payload?.message ?? "Unable to pull translations.",
    );
  }
  return payload.translations;
}

export async function createCanvaJob(input: {
  auth: string | CanvaResourceAuth;
  designToken: string;
  sourceLocale: string;
  targetLocales: string[];
  generate: boolean;
  segments: DesignSegment[];
}): Promise<{
  jobId: string;
  generated: boolean;
  projectId: string;
  sourcePath: string;
}> {
  const authorization = await getAuthorizationHeader();
  const response = await fetch(`${BACKEND_HOST}/api/integrations/canva/jobs`, {
    method: "POST",
    headers: buildRequestHeaders(input.auth, authorization),
    body: JSON.stringify({
      designToken: input.designToken,
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
      payload?.error ?? "canva_job_create_failed",
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

export async function generateCanvaJob(input: {
  auth: string | CanvaResourceAuth;
  jobId: string;
}): Promise<void> {
  const authorization = await getAuthorizationHeader();
  const response = await fetch(
    `${BACKEND_HOST}/api/integrations/canva/jobs/${encodeURIComponent(input.jobId)}/generate`,
    {
      method: "POST",
      headers: buildRequestHeaders(input.auth, authorization),
    },
  );
  if (!response.ok) {
    const payload = await readError(response);
    throw new HyperlocaliseClientError(
      payload.error ?? "canva_job_generate_failed",
      payload.message ?? "Unable to generate translations.",
    );
  }
}

export async function getCanvaJob(input: {
  auth: string | CanvaResourceAuth;
  jobId: string;
}): Promise<CanvaDesignJob> {
  const authorization = await getAuthorizationHeader();
  const response = await fetch(
    `${BACKEND_HOST}/api/integrations/canva/jobs/${encodeURIComponent(input.jobId)}`,
    { headers: buildRequestHeaders(input.auth, authorization) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({ job?: CanvaDesignJob } & ErrorPayload)
    | null;
  if (!response.ok || !payload?.job) {
    throw new HyperlocaliseClientError(
      payload?.error ?? "canva_job_status_failed",
      payload?.message ?? "Unable to load the translation job.",
    );
  }
  return payload.job;
}

export async function fetchCurrentCanvaJob(input: {
  auth: string | CanvaResourceAuth;
  designToken: string;
}): Promise<CanvaDesignJob | null> {
  const authorization = await getAuthorizationHeader();
  const params = new URLSearchParams({ designToken: input.designToken });
  const response = await fetch(
    `${BACKEND_HOST}/api/integrations/canva/jobs/current?${params.toString()}`,
    { headers: buildRequestHeaders(input.auth, authorization) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({ job?: CanvaDesignJob | null } & ErrorPayload)
    | null;
  if (!response.ok) {
    throw new HyperlocaliseClientError(
      payload?.error ?? "canva_current_job_failed",
      payload?.message ?? "Unable to load the current job.",
    );
  }
  return payload?.job ?? null;
}

export async function pullCanvaTranslations(input: {
  auth: string | CanvaResourceAuth;
  designToken: string;
}): Promise<CanvaDesignJob> {
  const authorization = await getAuthorizationHeader();
  const params = new URLSearchParams({ designToken: input.designToken });
  const response = await fetch(
    `${BACKEND_HOST}/api/integrations/canva/translations?${params.toString()}`,
    { headers: buildRequestHeaders(input.auth, authorization) },
  );
  const payload = (await response.json().catch(() => null)) as
    | ({
        translations?: CanvaDesignJob | { jobId: null; status: "not_found" };
      } & ErrorPayload)
    | null;
  if (!response.ok || !payload?.translations || !("jobId" in payload.translations)) {
    throw new HyperlocaliseClientError(
      payload?.error ?? "canva_translations_failed",
      payload?.message ?? "Unable to pull translations.",
    );
  }
  if (payload.translations.jobId == null) {
    throw new HyperlocaliseClientError(
      "translation_job_not_found",
      "No translations found for this design.",
    );
  }
  return payload.translations;
}

function buildHyperlocaliseOrigin(): string | null {
  try {
    const parsed = new URL(BACKEND_HOST);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function buildCanvaProjectUrl(input: {
  organizationSlug: string;
  projectId: string;
}): string | null {
  const origin = buildHyperlocaliseOrigin();
  if (!origin || !input.organizationSlug.trim() || !input.projectId.trim()) {
    return null;
  }
  return `${origin}/org/${encodeURIComponent(input.organizationSlug)}/projects/${encodeURIComponent(input.projectId)}`;
}

export function buildCanvaJobUrl(input: {
  organizationSlug: string;
  projectId: string;
  jobId: string;
}): string | null {
  const origin = buildHyperlocaliseOrigin();
  if (!origin) {
    return null;
  }
  return `${origin}/org/${encodeURIComponent(input.organizationSlug)}/projects/${encodeURIComponent(input.projectId)}/jobs/${encodeURIComponent(input.jobId)}`;
}

export async function openExternalUrl(url: string) {
  try {
    const { requestOpenExternalUrl } = await import("@canva/platform");
    await requestOpenExternalUrl({ url });
  } catch {
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }
}
