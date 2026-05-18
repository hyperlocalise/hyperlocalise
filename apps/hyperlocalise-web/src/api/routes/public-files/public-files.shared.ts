import { apiErrorResponse, badRequestResponse, notFoundResponse } from "@/api/response.schema";

export function invalidFilePayloadResponse(c: {
  json(body: Record<string, unknown>, status: number): Response;
}) {
  return badRequestResponse(c, "invalid_file_payload");
}

export function projectNotFoundResponse(c: {
  json(body: Record<string, unknown>, status: number): Response;
}) {
  return notFoundResponse(c, "project_not_found");
}

export function fileNotFoundResponse(c: {
  json(body: Record<string, unknown>, status: number): Response;
}) {
  return notFoundResponse(c, "file_not_found");
}

export function unsupportedFileResponse(
  c: { json(body: Record<string, unknown>, status: number): Response },
  filename: string,
) {
  return apiErrorResponse(c, 400, "unsupported_translation_source_file", undefined, undefined, {
    filename,
  });
}
