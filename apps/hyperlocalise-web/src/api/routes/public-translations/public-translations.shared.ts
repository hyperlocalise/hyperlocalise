import { badRequestResponse, JsonContext, notFoundResponse } from "@/api/response.schema";

export function invalidTranslationPayloadResponse(c: JsonContext) {
  return badRequestResponse(c, "invalid_translation_payload");
}

export function projectNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "project_not_found");
}
