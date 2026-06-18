import type { z } from "zod";

type ApiErrorResponseBody = {
  error?: unknown;
  message?: unknown;
};

export class ApiResponseError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(message: string, options: { code: string | null; status: number }) {
    super(message);
    this.name = "ApiResponseError";
    this.code = options.code;
    this.status = options.status;
  }
}

function readApiErrorBody(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") {
    return { code: null, message: fallback };
  }

  const { error, message } = body as ApiErrorResponseBody;
  const code = typeof error === "string" ? error : null;

  if (typeof message === "string") {
    return { code, message };
  }

  if (code) {
    return { code, message: code };
  }

  return { code: null, message: fallback };
}

export async function readApiResponseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  const { code, message } = readApiErrorBody(body, fallback);

  return new ApiResponseError(message, {
    code,
    status: response.status,
  });
}

export async function readApiError(response: Response, fallback: string) {
  return (await readApiResponseError(response, fallback)).message;
}

export async function parseApiJsonResponse<TSchema extends z.ZodType>(
  response: Response,
  schema: TSchema,
  fallbackMessage: string,
): Promise<z.infer<TSchema>> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw new ApiResponseError(fallbackMessage, {
      code: "invalid_response",
      status: response.status,
    });
  }

  return parsed.data;
}

export function isApiResponseErrorCode(error: unknown, code: string) {
  return error instanceof ApiResponseError && error.code === code;
}
