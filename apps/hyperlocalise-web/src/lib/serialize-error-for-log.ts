type SerializedLogError = Record<string, unknown>;

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

export function errorToLogObject(error: Error): SerializedLogError {
  const details: SerializedLogError = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: error.cause,
  };

  const maybeApiError = error as Error & {
    response?: { status?: number; statusText?: string; url?: string };
    json?: unknown;
    sandboxId?: string;
  };
  if (maybeApiError.response) {
    details.responseStatus = maybeApiError.response.status;
    details.responseStatusText = maybeApiError.response.statusText;
    details.responseUrl = maybeApiError.response.url;
  }
  if (maybeApiError.json !== undefined) {
    details.responseJson = maybeApiError.json;
  }
  if (maybeApiError.sandboxId !== undefined) {
    details.sandboxId = maybeApiError.sandboxId;
  }

  return details;
}

export function serializeErrorForLog(error: unknown): SerializedLogError {
  if (!isError(error)) {
    return { error };
  }

  return errorToLogObject(error);
}
