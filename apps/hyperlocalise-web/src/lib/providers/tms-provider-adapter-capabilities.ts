import { TmsProviderAdapter } from "@/lib/providers/contracts/tms-provider-adapter";

export function adapterSupportsReviewPull(adapter: TmsProviderAdapter): boolean {
  return adapter.pullReview !== TmsProviderAdapter.prototype.pullReview;
}

export function adapterSupportsCommentPush(adapter: TmsProviderAdapter): boolean {
  return adapter.pushComments !== TmsProviderAdapter.prototype.pushComments;
}

export function adapterSupportsGlossaryMatch(adapter: TmsProviderAdapter): boolean {
  return adapter.searchGlossaryMatches !== TmsProviderAdapter.prototype.searchGlossaryMatches;
}

export function adapterSupportsTranslationMemoryMatch(adapter: TmsProviderAdapter): boolean {
  return (
    adapter.searchTranslationMemoryMatches !==
    TmsProviderAdapter.prototype.searchTranslationMemoryMatches
  );
}
