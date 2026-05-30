export type WorkosErrorLogContext = {
  errorName: string;
  errorMessage?: string;
  workosErrorCode?: string;
  workosRequestId?: string;
};

export function serializeWorkosErrorForLog(error: unknown): WorkosErrorLogContext {
  if (!(error instanceof Error)) {
    return { errorName: "unknown_error" };
  }

  const context: WorkosErrorLogContext = {
    errorName: error.name,
    errorMessage: error.message,
  };

  if ("code" in error && typeof error.code === "string") {
    context.workosErrorCode = error.code;
  }

  if ("requestID" in error && typeof error.requestID === "string") {
    context.workosRequestId = error.requestID;
  }

  return context;
}
