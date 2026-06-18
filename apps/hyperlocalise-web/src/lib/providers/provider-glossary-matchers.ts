import type {
  ExternalTmsGlossaryMatcher,
  ExternalTmsGlossaryMatcherInput,
} from "@/lib/providers/contracts/glossary-matcher";

export type { ExternalTmsGlossaryMatcher, ExternalTmsGlossaryMatcherInput };

export { getProviderGlossaryMatcher } from "@/lib/providers/adapters/tms-provider-adapter-registry";
