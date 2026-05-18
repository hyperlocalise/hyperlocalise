export function fileNotFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "not_found" }, 404);
}
