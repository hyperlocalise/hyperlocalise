export function requestUrlString(url: Parameters<typeof fetch>[0]): string {
  if (typeof url === "string") {
    return url;
  }
  if (url instanceof URL) {
    return url.toString();
  }
  return url.url;
}

export function requestBodyString(body: BodyInit | null | undefined): string {
  if (typeof body === "string") {
    return body;
  }
  throw new Error(
    body == null
      ? "Expected fetch mock request body"
      : `Unsupported fetch mock body type: ${typeof body}`,
  );
}
