/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  getTmsProviderActionCapability,
  getTmsProviderCapability,
  knownTmsProviderIds,
  normalizeTmsProviderCapabilityRegistryEntry,
  providerSupportsTmsAction,
  tmsProviderCapabilityActions,
  tmsProviderCapabilityRegistry,
} from "@/lib/providers/capabilities/tms-capabilities";

describe("normalizeTmsProviderCapabilityRegistryEntry", () => {
  it("fills every known action with stable UI metadata", () => {
    const provider = normalizeTmsProviderCapabilityRegistryEntry({
      id: "future_provider",
      label: "Future Provider",
      capabilities: {
        "files.upload": true,
        "write_back.source": {
          supported: false,
          ui: { state: "disabled", disabledReason: "Source write-back is not available." },
        },
      },
    });

    expect(Object.keys(provider.capabilities)).toEqual([...tmsProviderCapabilityActions]);
    expect(provider.capabilities["files.upload"]).toEqual({
      supported: true,
      label: "Upload files",
      ui: { state: "enabled" },
    });
    expect(provider.capabilities["write_back.source"]).toEqual({
      supported: false,
      label: "Write source content back",
      ui: { state: "disabled", disabledReason: "Source write-back is not available." },
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
    ["phrase", "tasks.create", true],
    ["crowdin", "projects.write", true],
    ["crowdin", "tasks.create", true],
    ["crowdin", "translation_memory.export", true],
    ["lokalise", "glossary.export", true],
    ["lokalise", "translation_memory.export", true],
    ["lokalise", "translation_memory.import", true],
    ["lokalise", "comments.read", true],
    ["lokalise", "comments.write", true],
  ] as const)("answers whether %s supports %s", (provider, action, supported) => {
    expect(providerSupportsTmsAction(provider, action)).toBe(supported);
  });

  it("exposes hidden metadata for unsupported provider actions", () => {
    expect(getTmsProviderActionCapability("phrase", "write_back.source")).toMatchObject({
      supported: false,
      ui: {
        state: "hidden",
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

  it.each(["My TMS", "Phrase", "1invalid", ""])(
    "returns a normalized empty capability set for invalid provider id %s",
    (providerId) => {
      const provider = getTmsProviderCapability(providerId);

      expect(provider.id).toBe(providerId);
      expect(provider.label).toBe(providerId);
      expect(provider.capabilities["files.download"]).toMatchObject({
        supported: false,
        ui: { state: "hidden" },
      });
    },
  );
});
