export type ExternalTmsProviderKind = "crowdin" | "smartling" | "phrase" | "lokalise";

export const externalTmsProviderKinds = [
  "crowdin",
  "smartling",
  "phrase",
  "lokalise",
] as const satisfies readonly ExternalTmsProviderKind[];
