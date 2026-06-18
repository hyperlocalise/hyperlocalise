import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";

type ProviderOptionalCapabilities = {
  reviewPull: boolean;
  commentPush: boolean;
  glossaryMatch: boolean;
  translationMemoryMatch: boolean;
};

// Client-safe capability flags. Keep in sync with adapter method overrides; registry
// tests assert these match adapterSupports*() derived from TmsProviderAdapter.
const providerOptionalCapabilities: Record<ExternalTmsProviderKind, ProviderOptionalCapabilities> =
  {
    crowdin: {
      reviewPull: true,
      commentPush: true,
      glossaryMatch: true,
      translationMemoryMatch: true,
    },
    phrase: {
      reviewPull: true,
      commentPush: false,
      glossaryMatch: false,
      translationMemoryMatch: true,
    },
    lokalise: {
      reviewPull: true,
      commentPush: true,
      glossaryMatch: true,
      translationMemoryMatch: true,
    },
    smartling: {
      reviewPull: false,
      commentPush: true,
      glossaryMatch: true,
      translationMemoryMatch: true,
    },
  };

export function providerSupportsReviewPull(providerKind: ExternalTmsProviderKind): boolean {
  return providerOptionalCapabilities[providerKind].reviewPull;
}

export function providerSupportsCommentPush(providerKind: ExternalTmsProviderKind): boolean {
  return providerOptionalCapabilities[providerKind].commentPush;
}

export function providerSupportsGlossaryMatch(providerKind: ExternalTmsProviderKind): boolean {
  return providerOptionalCapabilities[providerKind].glossaryMatch;
}

export function providerSupportsTranslationMemoryMatch(
  providerKind: ExternalTmsProviderKind,
): boolean {
  return providerOptionalCapabilities[providerKind].translationMemoryMatch;
}
