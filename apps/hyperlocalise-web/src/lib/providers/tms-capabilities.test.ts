import { describe, expect, it } from "vite-plus/test";

import {
  getTmsProviderActionCapability,
  getTmsProviderCapability,
  knownTmsProviderIds,
  normalizeTmsProviderCapabilityRegistryEntry,
  providerSupportsTmsAction,
  tmsProviderCapabilityActions,
  tmsProviderCapabilityRegistry,
} from "./tms-capabilities";

describe("normalizeTmsProviderCapabilityRegistryEntry", () => {
  it("fills every known action with stable UI metadata", () => {
    const provider = normalizeTmsProviderCapabilityRegistryEntry({
      id: "future_provider",
      label: "Future Provider",
      capabilities: {
        "files.upload": true,
        "qa.run": {
          supported: false,
          ui: { state: "disabled", disabledReason: "QA is not available." },
        },
      },
    });

    expect(Object.keys(provider.capabilities)).toEqual([...tmsProviderCapabilityActions]);
    expect(provider.capabilities["files.upload"]).toEqual({
      supported: true,
      label: "Upload files",
      ui: { state: "enabled" },
    });
    expect(provider.capabilities["qa.run"]).toEqual({
      supported: false,
      label: "Run QA checks",
      ui: { state: "disabled", disabledReason: "QA is not available." },
    });
    expect(provider.capabilities["webhooks.configure"]).toEqual({
      supported: false,
      label: "Configure webhooks",
      ui: {
        state: "hidden",
        disabledReason: "This provider connector does not support this action yet.",
      },
    });
  });

  it("preserves custom labels and descriptions for UI surfaces", () => {
    const provider = normalizeTmsProviderCapabilityRegistryEntry({
      id: "review_tms",
      label: "Review TMS",
      capabilities: {
        "comments.write": {
          label: "Reply to reviewer comments",
          description: "Posts a comment through the provider API.",
          ui: { state: "enabled" },
        },
      },
    });

    expect(provider.capabilities["comments.write"]).toEqual({
      supported: true,
      label: "Reply to reviewer comments",
      description: "Posts a comment through the provider API.",
      ui: { state: "enabled" },
    });
  });

  it("does not synthesize unsupported copy for supported disabled UI states", () => {
    const provider = normalizeTmsProviderCapabilityRegistryEntry({
      id: "setup_tms",
      label: "Setup TMS",
      capabilities: {
        "webhooks.configure": {
          ui: { state: "disabled" },
        },
      },
    });

    expect(provider.capabilities["webhooks.configure"]).toEqual({
      supported: true,
      label: "Configure webhooks",
      ui: { state: "disabled" },
    });
  });
});

describe("tmsProviderCapabilityRegistry", () => {
  it("registers each curated provider", () => {
    expect(Object.keys(tmsProviderCapabilityRegistry)).toEqual([...knownTmsProviderIds]);
  });

  it.each([
    ["smartling", "translation_memory.import", true],
    ["smartling", "qa.run", true],
    ["phrase", "tasks.create", true],
    ["phrase", "qa.run", false],
    ["crowdin", "projects.write", true],
    ["crowdin", "translation_memory.export", true],
    ["lokalise", "glossary.export", true],
    ["lokalise", "translation_memory.export", false],
  ] as const)("answers whether %s supports %s", (provider, action, supported) => {
    expect(providerSupportsTmsAction(provider, action)).toBe(supported);
  });

  it("exposes disabled metadata for unsupported provider actions", () => {
    expect(getTmsProviderActionCapability("lokalise", "translation_memory.import")).toMatchObject({
      supported: false,
      ui: {
        state: "disabled",
        disabledReason: "Lokalise translation memory support is not wired into this connector yet.",
      },
    });
  });

  it("returns a normalized empty capability set for future providers", () => {
    const provider = getTmsProviderCapability("transifex");

    expect(provider.id).toBe("transifex");
    expect(provider.label).toBe("transifex");
    expect(provider.capabilities["files.download"]).toMatchObject({
      supported: false,
      ui: { state: "hidden" },
    });
  });
});
