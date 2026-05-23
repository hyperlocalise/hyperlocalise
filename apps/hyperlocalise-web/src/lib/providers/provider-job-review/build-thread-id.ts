import type { ProviderReviewThreadKind } from "./types";

export function buildProviderReviewThreadId(input: {
  providerKind: string;
  externalProjectId: string;
  externalJobId: string;
  kind: ProviderReviewThreadKind;
  externalThreadId: string;
}) {
  return [
    input.providerKind,
    input.externalProjectId,
    input.externalJobId,
    input.kind,
    input.externalThreadId,
  ].join(":");
}
