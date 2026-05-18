import {
  badRequestResponse,
  JsonContext,
  notFoundResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";

export function invalidJobPayloadResponse(c: JsonContext) {
  return badRequestResponse(c, "invalid_job_payload");
}

export function jobNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "job_not_found");
}

export function sourceFileNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "source_file_not_found");
}

export function unsupportedSourceFileFormatResponse(c: JsonContext) {
  return badRequestResponse(c, "unsupported_source_file_format");
}

export function sourceFileFormatMismatchResponse(c: JsonContext, expectedFileFormat: string) {
  return badRequestResponse(c, "source_file_format_mismatch", undefined, {
    expectedFileFormat,
  });
}

export function jobQueueUnavailableResponse(c: JsonContext) {
  return serviceUnavailableResponse(c, "job_queue_unavailable");
}

export function projectNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "project_not_found");
}
