import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";

const reviewPullerKinds = new Set<ExternalTmsProviderKind>(["crowdin", "phrase", "lokalise"]);
const commentPusherKinds = new Set<ExternalTmsProviderKind>(["crowdin", "lokalise", "smartling"]);
const glossaryMatcherKinds = new Set<ExternalTmsProviderKind>(["crowdin", "lokalise", "smartling"]);
const translationMemoryMatcherKinds = new Set<ExternalTmsProviderKind>([
  "crowdin",
  "phrase",
  "lokalise",
  "smartling",
]);

export function providerSupportsReviewPull(providerKind: ExternalTmsProviderKind): boolean {
  return reviewPullerKinds.has(providerKind);
}

export function providerSupportsCommentPush(providerKind: ExternalTmsProviderKind): boolean {
  return commentPusherKinds.has(providerKind);
}

export function providerSupportsGlossaryMatch(providerKind: ExternalTmsProviderKind): boolean {
  return glossaryMatcherKinds.has(providerKind);
}

export function providerSupportsTranslationMemoryMatch(
  providerKind: ExternalTmsProviderKind,
): boolean {
  return translationMemoryMatcherKinds.has(providerKind);
}
