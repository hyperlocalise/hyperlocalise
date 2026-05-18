import { notFoundResponse } from "@/api/errors";

export function fileNotFoundResponse(c: { json: Parameters<typeof notFoundResponse>[0]["json"] }) {
  return notFoundResponse(c, "not_found", "File not found");
}
