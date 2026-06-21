import { badRequestResponse, JsonContext, notFoundResponse } from "@/api/response.schema";

export function invalidTranslationPayloadResponse(c: JsonContext) {
  return badRequestResponse(c, "invalid_translation_payload");
}

export function projectNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "project_not_found");
}

export function sourceFileTooLargeResponse(c: JsonContext, maxKeyCount: number) {
  return c.json(
    {
      error: "source_file_too_large",
      message: `Source file exceeds the maximum of ${maxKeyCount} keys`,
    },
    422,
  );
}

export function sourceFileNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "source_file_not_found", "Source file not found");
}
