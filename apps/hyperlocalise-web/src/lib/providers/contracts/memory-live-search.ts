export function memorySupportsLiveSearch(memory: {
  capabilityMode: string | null;
  externalProviderKind: string | null;
}) {
  if (memory.externalProviderKind === "lokalise" || memory.externalProviderKind === "smartling") {
    return memory.capabilityMode === "live_search" || memory.capabilityMode === "synced_import";
  }

  return memory.capabilityMode === "live_search";
}
