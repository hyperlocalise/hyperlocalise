export function invalidFilePayloadResponse(c: {
  json(body: { error: string }, status: 400): Response;
}) {
  return c.json({ error: "invalid_file_payload" }, 400);
}

export function projectNotFoundResponse(c: {
  json(body: { error: string }, status: 404): Response;
}) {
  return c.json({ error: "project_not_found" }, 404);
}

export function fileNotFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "file_not_found" }, 404);
}

export function unsupportedFileResponse(
  c: { json(body: { error: string; filename: string }, status: 400): Response },
  filename: string,
) {
  return c.json({ error: "unsupported_translation_source_file", filename }, 400);
}
