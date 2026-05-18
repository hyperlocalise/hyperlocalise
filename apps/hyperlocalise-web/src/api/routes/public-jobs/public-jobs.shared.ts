import {
  badRequestResponse,
  JsonContext,
  notFoundResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";

export function invalidJobPayloadResponse(c: JsonContext) {
  return badRequestResponse(c, "invalid_job_payload", "Invalid job payload");
}

export function jobNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "job_not_found", "Job not found");
}

export function sourceFileNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "source_file_not_found", "Source file not found");
}

export function unsupportedSourceFileFormatResponse(c: JsonContext) {
  return badRequestResponse(c, "unsupported_source_file_format", "Unsupported source file format");
}

export function sourceFileFormatMismatchResponse(c: JsonContext, expectedFileFormat: string) {
  return badRequestResponse(
    c,
    "source_file_format_mismatch",
    "Source file format does not match the requested format",
    {
      expectedFileFormat,
    },
  );
}

export function jobQueueUnavailableResponse(c: JsonContext) {
  return serviceUnavailableResponse(c, "job_queue_unavailable", "Job queue is unavailable");
}

export function projectNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "project_not_found", "Project not found");
}
