import type {
  ExternalTmsTranslationMemoryMatcher,
  ExternalTmsTranslationMemoryMatcherInput,
} from "@/lib/providers/contracts/translation-memory-matcher";

export type { ExternalTmsTranslationMemoryMatcher, ExternalTmsTranslationMemoryMatcherInput };

export { getProviderTranslationMemoryMatcher } from "@/lib/providers/adapters/tms-provider-adapter-registry";
