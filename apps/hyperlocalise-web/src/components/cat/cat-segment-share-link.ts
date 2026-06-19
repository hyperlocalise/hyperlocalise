export const catSegmentShareParam = "segment";

export function buildCatSegmentShareUrl(input: {
  baseUrl: string;
  segmentId: string;
  segmentKey?: string;
}) {
  const url = new URL(input.baseUrl);
  url.searchParams.set(catSegmentShareParam, input.segmentKey ?? input.segmentId);
  return url.toString();
}

export function readCatSegmentShareParam(searchParams: URLSearchParams) {
  const value = searchParams.get(catSegmentShareParam)?.trim();
  return value || null;
}
