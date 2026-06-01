export function readApiError(response: Response, fallback: string) {
  return response
    .json()
    .then((body) =>
      body && typeof body === "object" && "message" in body
        ? String(body.message)
        : body && typeof body === "object" && "error" in body
          ? String(body.error)
          : fallback,
    )
    .catch(() => fallback);
}
