import type {
  CanvaOrganizationSummary,
  CanvaProjectSummary,
  DesignSegment,
  LocalizeResponse,
} from "./types";
import { getHyperlocaliseAccessToken } from "./oauth";

declare const BACKEND_HOST: string;

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

async function getCanvaUserToken(): Promise<string | undefined> {
  try {
    const { auth } = await import("@canva/user");
    const token = await auth.getCanvaUserToken();
    return token || undefined;
  } catch {
    return undefined;
  }
}

async function buildRequestHeaders(requireAuth: boolean) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const canvaUserToken = await getCanvaUserToken();
  if (canvaUserToken) {
    headers["X-Canva-User-Token"] = canvaUserToken;
  }

  if (requireAuth) {
    const accessToken = await getHyperlocaliseAccessToken();
    if (!accessToken) {
      throw new HyperlocaliseClientError(
        "canva_oauth_required",
        "Sign in with Hyperlocalise to continue.",
      );
    }
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

type MeResponse = {
  user: { id: string; email: string };
  organizations: CanvaOrganizationSummary[];
  brandBinding: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string | null;
  } | null;
};

type ProjectsResponse = {
  projects: CanvaProjectSummary[];
};

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

export async function fetchCanvaMe(): Promise<MeResponse> {
  const response = await fetch(`${BACKEND_HOST}/api/integrations/canva/me`, {
    method: "GET",
    headers: await buildRequestHeaders(true),
  });

  const payload = (await response.json().catch(() => null)) as
    | (MeResponse & { error?: string; message?: string })
    | null;

  if (!response.ok || !payload?.user) {
    const code = payload?.error ?? "canva_me_request_failed";
    const message = payload?.message ?? "Unable to load your Hyperlocalise account.";
    throw new HyperlocaliseClientError(code, message);
  }

  return payload;
}

export async function fetchCanvaProjects(organizationId: string): Promise<CanvaProjectSummary[]> {
  const response = await fetch(
    `${BACKEND_HOST}/api/integrations/canva/projects?organizationId=${encodeURIComponent(organizationId)}`,
    {
      method: "GET",
      headers: await buildRequestHeaders(true),
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | (ProjectsResponse & { error?: string; message?: string })
    | null;

  if (!response.ok || !payload?.projects) {
    const code = payload?.error ?? "canva_projects_request_failed";
    const message = payload?.message ?? "Unable to load projects for this workspace.";
    throw new HyperlocaliseClientError(code, message);
  }

  return payload.projects;
}

export async function startLocalizeDesign(request: {
  organizationId: string;
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  designToken: string;
  segments: DesignSegment[];
  rememberBrandOrgBinding?: boolean;
}): Promise<StartLocalizeResponse> {
  const response = await fetch(`${BACKEND_HOST}/api/integrations/canva/localize`, {
    method: "POST",
    headers: await buildRequestHeaders(true),
    body: JSON.stringify(request),
  });

  const payload = (await response.json().catch(() => null)) as
    | (StartLocalizeResponse & { error?: string; message?: string })
    | null;

  if (!response.ok || !payload?.jobId) {
    const errorPayload = payload ?? (await parseErrorPayload(response));
    const code = errorPayload?.error ?? "localize_request_failed";
    const message = errorPayload?.message ?? "Unable to localize this design.";
    throw new HyperlocaliseClientError(code, message);
  }

  return payload;
}

export async function pollLocalizeDesign(input: {
  organizationId: string;
  projectId: string;
  jobId: string;
}): Promise<LocalizeResponse> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const response = await fetch(
      `${BACKEND_HOST}/api/integrations/canva/localize/${encodeURIComponent(input.jobId)}?organizationId=${encodeURIComponent(input.organizationId)}&projectId=${encodeURIComponent(input.projectId)}`,
      {
        method: "GET",
        headers: await buildRequestHeaders(true),
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
