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
    command?: string;
    argCount?: number;
    argFlags?: string[];
    responseStatus?: number;
    responseStatusText?: string;
    responseUrl?: string;
    providerErrorCode?: string;
    providerErrorMessage?: string;
    providerRequestId?: string;
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
  if (maybeApiError.command !== undefined) {
    details.command = maybeApiError.command;
  }
  if (maybeApiError.argCount !== undefined) {
    details.argCount = maybeApiError.argCount;
  }
  if (maybeApiError.argFlags !== undefined) {
    details.argFlags = maybeApiError.argFlags;
  }
  if (maybeApiError.responseStatus !== undefined) {
    details.responseStatus = maybeApiError.responseStatus;
  }
  if (maybeApiError.responseStatusText !== undefined) {
    details.responseStatusText = maybeApiError.responseStatusText;
  }
  if (maybeApiError.responseUrl !== undefined) {
    details.responseUrl = maybeApiError.responseUrl;
  }
  if (maybeApiError.providerErrorCode !== undefined) {
    details.providerErrorCode = maybeApiError.providerErrorCode;
  }
  if (maybeApiError.providerErrorMessage !== undefined) {
    details.providerErrorMessage = maybeApiError.providerErrorMessage;
  }
  if (maybeApiError.providerRequestId !== undefined) {
    details.providerRequestId = maybeApiError.providerRequestId;
  }

  return details;
}

export function serializeErrorForLog(error: unknown): SerializedLogError {
  if (!isError(error)) {
    return { error };
  }

  return errorToLogObject(error);
}
