import {
  apiErrorResponse,
  badRequestResponse,
  notFoundResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";

export function invalidJobPayloadResponse(c: {
  json(body: Record<string, unknown>, status: number): Response;
}) {
  return badRequestResponse(c, "invalid_job_payload");
}

export function jobNotFoundResponse(c: {
  json(body: Record<string, unknown>, status: number): Response;
}) {
  return notFoundResponse(c, "job_not_found");
}

export function sourceFileNotFoundResponse(c: {
  json(body: Record<string, unknown>, status: number): Response;
}) {
  return notFoundResponse(c, "source_file_not_found");
}

export function unsupportedSourceFileFormatResponse(c: {
  json(body: Record<string, unknown>, status: number): Response;
}) {
  return badRequestResponse(c, "unsupported_source_file_format");
}

export function sourceFileFormatMismatchResponse(
  c: { json(body: Record<string, unknown>, status: number): Response },
  expectedFileFormat: string,
) {
  return apiErrorResponse(c, 400, "source_file_format_mismatch", undefined, undefined, {
    expectedFileFormat,
  });
}

export function jobQueueUnavailableResponse(c: {
  json(body: Record<string, unknown>, status: number): Response;
}) {
  return serviceUnavailableResponse(c, "job_queue_unavailable");
}

export function projectNotFoundResponse(c: {
  json(body: Record<string, unknown>, status: number): Response;
}) {
  return notFoundResponse(c, "project_not_found");
}
