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
import type { CanvaDesignJob, CanvaSession, DesignSegment } from "./types";

declare const BACKEND_HOST: string;

const CONNECTION_TOKEN_HEADER = "X-Hyperlocalise-Connection-Token";
const CLAIM_TOKEN_HEADER = "X-Hyperlocalise-Claim-Token";
export const CANVA_JOB_POLL_INTERVAL_MS = 1_500;
const CLAIM_POLL_INTERVAL_MS = 1_500;
const MAX_CLAIM_POLL_ATTEMPTS = 80;

export class HyperlocaliseClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "HyperlocaliseClientError";
  }
}

type ErrorPayload = { error?: string; message?: string };

async function getAuthorizationHeader(): Promise<string | undefined> {
  try {
    const { auth } = await import("@canva/user");
    const token = await auth.getCanvaUserToken();
    return `Bearer ${token}`;
  } catch {
    return undefined;
  }
}

function buildRequestHeaders(connectionToken: string, authorization?: string) {
  return {
    "Content-Type": "application/json",
    [CONNECTION_TOKEN_HEADER]: connectionToken,
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

export async function fetchCanvaSession(connectionToken: string): Promise<CanvaSession> {
  const authorization = await getAuthorizationHeader();
  const response = await fetch(`${BACKEND_HOST}/api/integrations/canva/session`, {
    headers: buildRequestHeaders(connectionToken, authorization),
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

export async function createCanvaJob(input: {
  connectionToken: string;
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
    headers: buildRequestHeaders(input.connectionToken, authorization),
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
  connectionToken: string;
  jobId: string;
}): Promise<void> {
  const authorization = await getAuthorizationHeader();
  const response = await fetch(
    `${BACKEND_HOST}/api/integrations/canva/jobs/${encodeURIComponent(input.jobId)}/generate`,
    {
      method: "POST",
      headers: buildRequestHeaders(input.connectionToken, authorization),
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
  connectionToken: string;
  jobId: string;
}): Promise<CanvaDesignJob> {
  const authorization = await getAuthorizationHeader();
  const response = await fetch(
    `${BACKEND_HOST}/api/integrations/canva/jobs/${encodeURIComponent(input.jobId)}`,
    { headers: buildRequestHeaders(input.connectionToken, authorization) },
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
  connectionToken: string;
  designToken: string;
}): Promise<CanvaDesignJob | null> {
  const authorization = await getAuthorizationHeader();
  const params = new URLSearchParams({ designToken: input.designToken });
  const response = await fetch(
    `${BACKEND_HOST}/api/integrations/canva/jobs/current?${params.toString()}`,
    { headers: buildRequestHeaders(input.connectionToken, authorization) },
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
  connectionToken: string;
  designToken: string;
}): Promise<CanvaDesignJob> {
  const authorization = await getAuthorizationHeader();
  const params = new URLSearchParams({ designToken: input.designToken });
  const response = await fetch(
    `${BACKEND_HOST}/api/integrations/canva/translations?${params.toString()}`,
    { headers: buildRequestHeaders(input.connectionToken, authorization) },
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

export function buildCanvaJobUrl(input: {
  organizationSlug: string;
  projectId: string;
  jobId: string;
}): string | null {
  try {
    const parsed = new URL(BACKEND_HOST);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return `${parsed.origin}/org/${encodeURIComponent(input.organizationSlug)}/projects/${encodeURIComponent(input.projectId)}/jobs/${encodeURIComponent(input.jobId)}`;
  } catch {
    return null;
  }
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
