import { badRequestResponse, JsonContext, notFoundResponse } from "@/api/response.schema";

export function invalidImagePayloadResponse(c: JsonContext) {
  return badRequestResponse(c, "invalid_image_payload");
}

export function projectNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "project_not_found");
}

export function imageVariantNotFoundResponse(c: JsonContext) {
  return notFoundResponse(
    c,
    "image_variant_not_found",
    "No image variant is available for this source path and locale.",
  );
}
