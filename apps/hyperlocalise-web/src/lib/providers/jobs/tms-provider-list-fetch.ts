import { ApiResponseError, readApiResponseError } from "@/lib/api-error";

function readErrorBody(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") {
    return { code: null, message: fallback };
  }

  const { error, message } = body as { error?: unknown; message?: unknown };
  const code = typeof error === "string" ? error : null;

  if (typeof message === "string") {
    return { code, message };
  }

  if (code) {
    return { code, message: code };
  }

  return { code: null, message: fallback };
}

export async function readTmsProviderListResponse<TItem>(
  response: Response,
  listKey: string,
  fallbackMessage: string,
): Promise<TItem[]> {
  if (!response.ok) {
    if (response.status === 404) {
      const body = await response.json().catch(() => null);
      if (
        body &&
        typeof body === "object" &&
        (body as { error?: string }).error === "no_active_tms_provider"
      ) {
        return [];
      }

      const { code, message } = readErrorBody(body, fallbackMessage);
      throw new ApiResponseError(message, { code, status: response.status });
    }

    throw await readApiResponseError(response, fallbackMessage);
  }

  const body = (await response.json()) as Record<string, unknown>;
  const items = body[listKey];

  if (!Array.isArray(items)) {
    throw new ApiResponseError(fallbackMessage, {
      code: "invalid_response",
      status: response.status,
    });
  }

  return items as TItem[];
}
