import { badRequestResponse, JsonContext, notFoundResponse } from "@/api/response.schema";

export function invalidFilePayloadResponse(c: JsonContext) {
  return badRequestResponse(c, "invalid_file_payload");
}

export function projectNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "project_not_found");
}

export function fileNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "file_not_found");
}

export function unsupportedFileResponse(c: JsonContext, filename: string) {
  return badRequestResponse(c, "unsupported_translation_source_file", undefined, {
    filename,
  });
}
