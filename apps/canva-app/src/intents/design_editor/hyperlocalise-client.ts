import type { LocalizeRequest, LocalizeResponse } from "./types";

declare const BACKEND_HOST: string;

const CONNECTION_TOKEN_HEADER = "X-Hyperlocalise-Connection-Token";
const POLL_INTERVAL_MS = 1_500;
const MAX_POLL_ATTEMPTS = 120;

export class HyperlocaliseClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "HyperlocaliseClientError";
  }
}

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

type StartLocalizeResponse = {
  jobId: string;
  mode: "hyperlocalise";
};

type PollLocalizeResponse =
  | {
      jobId: string;
      status: "queued" | "running";
      mode: "hyperlocalise";
    }
  | {
      jobId: string;
      status: "succeeded";
      translationsByLocale: Record<string, Record<string, string>>;
      mode: "hyperlocalise";
    };

async function parseErrorPayload(response: Response) {
  return (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
}

export async function startLocalizeDesign(
  request: LocalizeRequest,
): Promise<StartLocalizeResponse> {
  const authorization = await getAuthorizationHeader();
  const response = await fetch(`${BACKEND_HOST}/api/integrations/canva/localize`, {
    method: "POST",
    headers: buildRequestHeaders(request.connectionToken, authorization),
    body: JSON.stringify({
      designToken: request.designToken,
      segments: request.segments,
      ...(request.projectId ? { projectId: request.projectId } : {}),
      sourceLocale: request.sourceLocale,
      targetLocales: request.targetLocales,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (StartLocalizeResponse & { error?: string; message?: string })
    | null;

  if (!response.ok || !payload?.jobId) {
    const code = payload?.error ?? "localize_request_failed";
    const message = payload?.message ?? "Unable to localize this design.";
    throw new HyperlocaliseClientError(code, message);
  }

  return payload;
}

export async function pollLocalizeDesign(input: {
  connectionToken: string;
  jobId: string;
}): Promise<LocalizeResponse> {
  const authorization = await getAuthorizationHeader();

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const response = await fetch(
      `${BACKEND_HOST}/api/integrations/canva/localize/${encodeURIComponent(input.jobId)}`,
      {
        method: "GET",
        headers: buildRequestHeaders(input.connectionToken, authorization),
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | (PollLocalizeResponse & { error?: string; message?: string })
      | null;

    if (!response.ok || !payload) {
      const errorPayload = payload ?? (await parseErrorPayload(response));
      const code = errorPayload?.error ?? "localize_poll_failed";
      const message = errorPayload?.message ?? "Unable to check localization status.";
      throw new HyperlocaliseClientError(code, message);
    }

    if (payload.status === "succeeded") {
      return {
        jobId: payload.jobId,
        translationsByLocale: payload.translationsByLocale,
        mode: "hyperlocalise",
      };
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new HyperlocaliseClientError(
    "translation_job_timed_out",
    "Localization is taking longer than expected. Try again in a moment.",
  );
}

export async function localizeDesign(request: LocalizeRequest): Promise<LocalizeResponse> {
  const started = await startLocalizeDesign(request);
  return pollLocalizeDesign({
    connectionToken: request.connectionToken,
    jobId: started.jobId,
  });
}
