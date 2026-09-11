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

import type {
  HyperlabAudience,
  HyperlabExperiment,
  HyperlabFlag,
  HyperlabFlagConfig,
  HyperlabVariant,
} from "../_components/hyperlab-api";
import { emptyRuleGroup } from "../_components/hyperlab-criterion";
import { HyperlabAudienceStore } from "./hyperlab-audience-store";
import { HyperlabExperimentStore } from "./hyperlab-experiment-store";
import { HyperlabFlagStore } from "./hyperlab-flag-store";
import { createHyperlabWorkspace } from "./hyperlab-orchestrator";
import { HyperlabUiStore } from "./hyperlab-ui-store";

const sampleFlag: HyperlabFlag = {
  id: "flag-1",
  key: "checkout-cta",
  description: "Checkout CTA copy",
  kind: "config",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const sampleConfig: HyperlabFlagConfig = {
  flagId: "flag-1",
  value: { label: "Buy now" },
};

const sampleAudience: HyperlabAudience = {
  id: "audience-1",
  name: "Pro customers",
  description: "Paid plans",
  criterion: {
    type: "attribute",
    name: "plan",
    match: "exact",
    value: "pro",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const sampleExperiment: HyperlabExperiment = {
  id: "experiment-1",
  name: "Homepage hero",
  status: "draft",
  kind: "ab",
  audienceId: "audience-1",
  rolloutPercentage: 5000,
  startAt: "2026-06-01T09:00:00.000Z",
  endAt: "2026-06-30T17:00:00.000Z",
  timezone: "UTC",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const sampleVariants: HyperlabVariant[] = [
  {
    id: "variant-control",
    experimentId: "experiment-1",
    key: "control",
    isControl: true,
    audienceId: null,
    rolloutPercentage: 5000,
  },
  {
    id: "variant-b",
    experimentId: "experiment-1",
    key: "variant-b",
    isControl: false,
    audienceId: null,
    rolloutPercentage: 5000,
  },
];

describe("HyperlabFlagStore", () => {
  it("tracks dirty state for description and config text", () => {
    const store = new HyperlabFlagStore();
    store.applyServer(sampleFlag, sampleConfig);

    expect(store.isDirty).toBe(false);

    store.setDescription("Updated");
    expect(store.isDirty).toBe(true);

    store.markSaved();
    expect(store.isDirty).toBe(false);

    store.setConfigText('{"label":"Updated"}');
    expect(store.isDirty).toBe(true);
  });
});

describe("HyperlabAudienceStore", () => {
  it("hydrates from server data and tracks criterion edits", () => {
    const store = new HyperlabAudienceStore();
    store.applyServer(sampleAudience);

    expect(store.name).toBe("Pro customers");
    expect(store.isDirty).toBe(false);

    store.setName("Enterprise customers");
    expect(store.isDirty).toBe(true);

    store.markSaved();
    expect(store.isDirty).toBe(false);
  });

  it("resets cleanly", () => {
    const store = new HyperlabAudienceStore();
    store.applyServer(sampleAudience);
    store.clear();

    expect(store.name).toBe("");
    expect(JSON.stringify(store.group)).toBe(JSON.stringify(emptyRuleGroup()));
    expect(store.isDirty).toBe(false);
  });
});

describe("HyperlabExperimentStore", () => {
  it("tracks details, rollout, and split dirty state independently", () => {
    const store = new HyperlabExperimentStore();
    store.applyServer(sampleExperiment, sampleVariants);

    expect(store.detailsDirty).toBe(false);
    expect(store.rolloutDirty).toBe(false);
    expect(store.splitDirty).toBe(false);
    expect(store.splitTotal).toBe(10000);

    store.setName("Updated experiment");
    expect(store.detailsDirty).toBe(true);
    expect(store.rolloutDirty).toBe(false);

    store.markDetailsSaved();
    expect(store.detailsDirty).toBe(false);

    store.setRolloutPercentage(2500);
    expect(store.rolloutDirty).toBe(true);

    store.markRolloutSaved();
    expect(store.rolloutDirty).toBe(false);

    store.setVariantSplit("variant-b", 4000);
    expect(store.splitDirty).toBe(true);
    expect(store.splitTotal).toBe(9000);

    store.setVariantSplit("variant-b", 5000);
    store.markSplitsSaved();
    expect(store.splitDirty).toBe(false);
  });

  it("preserves dirty splits when unrelated experiment metadata refreshes", () => {
    const store = new HyperlabExperimentStore();
    store.applyServer(sampleExperiment, sampleVariants);

    store.setVariantSplit("variant-b", 4000);
    expect(store.splitDirty).toBe(true);

    store.applyServer({ ...sampleExperiment, name: "Renamed on server" }, sampleVariants);

    expect(store.name).toBe("Renamed on server");
    expect(store.variantSplits["variant-b"]).toBe(4000);
    expect(store.splitDirty).toBe(true);
  });

  it("preserves dirty details when rollout metadata refreshes", () => {
    const store = new HyperlabExperimentStore();
    store.applyServer(sampleExperiment, sampleVariants);

    store.setName("Pending name edit");
    store.applyServer({ ...sampleExperiment, rolloutPercentage: 2500 }, sampleVariants);

    expect(store.name).toBe("Pending name edit");
    expect(store.detailsDirty).toBe(true);
    expect(store.rolloutPercentage).toBe(2500);
    expect(store.rolloutDirty).toBe(false);
  });
});

describe("HyperlabUiStore", () => {
  it("tracks ephemeral UI state", () => {
    const store = new HyperlabUiStore();

    store.setCreatedSecret("hlk_secret_value");
    store.setAddVariantOpen(true);
    store.setVariantKey("variant-c");
    store.setVariantAudienceDraft("variant-b", "audience-2");
    store.setVariantSheetOpen("variant-b", true);

    expect(store.createdSecret).toBe("hlk_secret_value");
    expect(store.addVariantOpen).toBe(true);
    expect(store.variantKey).toBe("variant-c");
    expect(store.getVariantAudienceDraft("variant-b")).toBe("audience-2");
    expect(store.isVariantSheetOpen("variant-b")).toBe(true);

    store.resetAddVariantDialog();
    expect(store.addVariantOpen).toBe(false);
    expect(store.variantKey).toBe("");
  });

  it("preserves pending variant audience drafts on refresh", () => {
    const store = new HyperlabUiStore();

    store.applyVariantAudience("variant-b", null);
    store.setVariantAudienceDraft("variant-b", "audience-2");

    store.applyVariantAudience("variant-b", null);

    expect(store.getVariantAudienceDraft("variant-b")).toBe("audience-2");

    store.applyVariantAudience("variant-b", "audience-2");

    expect(store.getVariantAudienceDraft("variant-b")).toBe("audience-2");
  });
});

describe("HyperlabWorkspaceOrchestrator", () => {
  it("routes server snapshots to domain stores", () => {
    const workspace = createHyperlabWorkspace();

    workspace.ingestFlag(sampleFlag, sampleConfig);
    workspace.ingestAudience(sampleAudience);
    workspace.ingestExperiment(sampleExperiment, sampleVariants);

    expect(workspace.flag.description).toBe("Checkout CTA copy");
    expect(workspace.audience.name).toBe("Pro customers");
    expect(workspace.experiment.name).toBe("Homepage hero");
    expect(workspace.ui.getVariantAudienceDraft("variant-control")).toBe("");

    workspace.clear();
    expect(workspace.flag.isDirty).toBe(false);
    expect(workspace.audience.name).toBe("");
    expect(workspace.experiment.name).toBe("");
    expect(workspace.ui.createdSecret).toBeNull();
  });

  it("preserves pending variant audience drafts during experiment refresh", () => {
    const workspace = createHyperlabWorkspace();

    workspace.ingestExperiment(sampleExperiment, sampleVariants);
    workspace.ui.setVariantAudienceDraft("variant-b", "audience-2");

    workspace.ingestExperiment(sampleExperiment, sampleVariants);

    expect(workspace.ui.getVariantAudienceDraft("variant-b")).toBe("audience-2");
  });
});
