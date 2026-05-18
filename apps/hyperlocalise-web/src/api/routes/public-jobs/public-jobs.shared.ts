export function invalidJobPayloadResponse(c: {
  json(body: { error: string }, status: 400): Response;
}) {
  return c.json({ error: "invalid_job_payload" }, 400);
}

export function jobNotFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "job_not_found" }, 404);
}

export function sourceFileNotFoundResponse(c: {
  json(body: { error: string }, status: 404): Response;
}) {
  return c.json({ error: "source_file_not_found" }, 404);
}

export function unsupportedSourceFileFormatResponse(c: {
  json(body: { error: string }, status: 400): Response;
}) {
  return c.json({ error: "unsupported_source_file_format" }, 400);
}

export function sourceFileFormatMismatchResponse(
  c: { json(body: { error: string; expectedFileFormat: string }, status: 400): Response },
  expectedFileFormat: string,
) {
  return c.json({ error: "source_file_format_mismatch", expectedFileFormat }, 400);
}

export function jobQueueUnavailableResponse(c: {
  json(body: { error: string }, status: 503): Response;
}) {
  return c.json({ error: "job_queue_unavailable" }, 503);
}

export function projectNotFoundResponse(c: {
  json(body: { error: string }, status: 404): Response;
}) {
  return c.json({ error: "project_not_found" }, 404);
}
