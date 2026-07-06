import { schema } from "@/lib/database";

export type ExternalTmsMemoryCapabilityMode =
  (typeof schema.externalTmsMemoryCapabilityModeEnum.enumValues)[number];

export function buildExternalTmsMemorySegmentCapabilities(mode: ExternalTmsMemoryCapabilityMode) {
  switch (mode) {
    case "live_search":
      return {
        mode,
        search: true,
        import: false,
        export: false,
        referenceOnly: false,
      };
    case "synced_import":
      return {
        mode,
        search: true,
        import: true,
        export: true,
        referenceOnly: false,
      };
    case "reference_only":
      return {
        mode,
        search: false,
        import: false,
        export: false,
        referenceOnly: true,
      };
  }
}
