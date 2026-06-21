import type { LocalizeRequest, LocalizeResponse } from "./types";

declare const BACKEND_HOST: string;

const CONNECTION_TOKEN_HEADER = "X-Hyperlocalise-Connection-Token";

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

export async function localizeDesign(request: LocalizeRequest): Promise<LocalizeResponse> {
  const authorization = await getAuthorizationHeader();
  const response = await fetch(`${BACKEND_HOST}/api/integrations/canva/localize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [CONNECTION_TOKEN_HEADER]: request.connectionToken,
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify({
      designToken: request.designToken,
      segments: request.segments,
      ...(request.projectId ? { projectId: request.projectId } : {}),
      sourceLocale: request.sourceLocale,
      targetLocales: request.targetLocales,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (LocalizeResponse & { error?: string; message?: string })
    | null;

  if (!response.ok || !payload) {
    const code = payload?.error ?? "localize_request_failed";
    const message = payload?.message ?? "Unable to localize this design.";
    throw new HyperlocaliseClientError(code, message);
  }

  return payload;
}
