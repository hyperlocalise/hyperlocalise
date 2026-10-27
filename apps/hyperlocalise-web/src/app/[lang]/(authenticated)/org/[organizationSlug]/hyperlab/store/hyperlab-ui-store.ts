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
import { makeAutoObservable } from "mobx";

import { addMonthsIsoDate, todayIsoDate } from "../_components/hyperlab-schedule";

export type HyperlabCreateExperimentKind = "toggle" | "ab";
export type HyperlabCreateFlagKind = "experiment" | "config";

export type HyperlabCreateExperimentDraft = {
  name: string;
  kind: HyperlabCreateExperimentKind;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  zone: string;
};

export type HyperlabCreateFlagDraft = {
  key: string;
  kind: HyperlabCreateFlagKind;
  description: string;
};

export type HyperlabCreateAudienceDraft = {
  name: string;
  description: string;
};

function defaultHyperlabZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Australia/Sydney";
}

export function emptyHyperlabCreateExperimentDraft(
  zone = defaultHyperlabZone(),
): HyperlabCreateExperimentDraft {
  const startDate = todayIsoDate(zone);
  return {
    name: "",
    kind: "toggle",
    startDate,
    startTime: "09:00",
    endDate: addMonthsIsoDate(startDate, 3),
    endTime: "17:00",
    zone,
  };
}

export function emptyHyperlabCreateFlagDraft(): HyperlabCreateFlagDraft {
  return { key: "", kind: "experiment", description: "" };
}

export function emptyHyperlabCreateAudienceDraft(): HyperlabCreateAudienceDraft {
  return { name: "", description: "" };
}

export class HyperlabUiStore {
  createdSecret: string | null = null;
  addVariantOpen = false;
  variantKey = "";
  variantAudienceDrafts = new Map<string, string>();
  variantSheetOpen = new Map<string, boolean>();
  createExperimentOpen = false;
  createExperimentDraft: HyperlabCreateExperimentDraft = emptyHyperlabCreateExperimentDraft();
  createFlagOpen = false;
  createFlagDraft: HyperlabCreateFlagDraft = emptyHyperlabCreateFlagDraft();
  createAudienceOpen = false;
  createAudienceDraft: HyperlabCreateAudienceDraft = emptyHyperlabCreateAudienceDraft();
  createKeyOpen = false;
  createKeyName = "";

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setCreatedSecret(value: string | null) {
    this.createdSecret = value;
  }

  setAddVariantOpen(value: boolean) {
    this.addVariantOpen = value;
  }

  setVariantKey(value: string) {
    this.variantKey = value;
  }

  resetAddVariantDialog() {
    this.addVariantOpen = false;
    this.variantKey = "";
  }

  setVariantAudienceDraft(variantId: string, audienceId: string) {
    this.variantAudienceDrafts.set(variantId, audienceId);
  }

  getVariantAudienceDraft(variantId: string, fallback = "") {
    return this.variantAudienceDrafts.get(variantId) ?? fallback;
  }

  applyVariantAudience(variantId: string, audienceId: string | null) {
    const serverAudience = audienceId ?? "";
    const draft = this.variantAudienceDrafts.get(variantId);
    const hasPendingDraft = draft !== undefined && draft !== serverAudience;
    if (!hasPendingDraft) {
      this.variantAudienceDrafts.set(variantId, serverAudience);
    }
  }

  isVariantSheetOpen(variantId: string) {
    return this.variantSheetOpen.get(variantId) ?? false;
  }

  setVariantSheetOpen(variantId: string, open: boolean) {
    this.variantSheetOpen.set(variantId, open);
  }

  setCreateExperimentOpen(open: boolean) {
    this.createExperimentOpen = open;
    if (!open) {
      this.createExperimentDraft = emptyHyperlabCreateExperimentDraft(
        this.createExperimentDraft.zone,
      );
    }
  }

  patchCreateExperimentDraft(patch: Partial<HyperlabCreateExperimentDraft>) {
    this.createExperimentDraft = { ...this.createExperimentDraft, ...patch };
  }

  resetCreateExperimentDialog() {
    this.createExperimentOpen = false;
    this.createExperimentDraft = emptyHyperlabCreateExperimentDraft(
      this.createExperimentDraft.zone,
    );
  }

  setCreateFlagOpen(open: boolean) {
    this.createFlagOpen = open;
    if (!open) {
      this.createFlagDraft = emptyHyperlabCreateFlagDraft();
    }
  }

  patchCreateFlagDraft(patch: Partial<HyperlabCreateFlagDraft>) {
    this.createFlagDraft = { ...this.createFlagDraft, ...patch };
  }

  resetCreateFlagDialog() {
    this.createFlagOpen = false;
    this.createFlagDraft = emptyHyperlabCreateFlagDraft();
  }

  setCreateAudienceOpen(open: boolean) {
    this.createAudienceOpen = open;
    if (!open) {
      this.createAudienceDraft = emptyHyperlabCreateAudienceDraft();
    }
  }

  patchCreateAudienceDraft(patch: Partial<HyperlabCreateAudienceDraft>) {
    this.createAudienceDraft = { ...this.createAudienceDraft, ...patch };
  }

  resetCreateAudienceDialog() {
    this.createAudienceOpen = false;
    this.createAudienceDraft = emptyHyperlabCreateAudienceDraft();
  }

  setCreateKeyOpen(open: boolean) {
    this.createKeyOpen = open;
    if (!open) {
      this.createKeyName = "";
    }
  }

  setCreateKeyName(name: string) {
    this.createKeyName = name;
  }

  resetCreateKeyDialog() {
    this.createKeyOpen = false;
    this.createKeyName = "";
  }

  clear() {
    this.createdSecret = null;
    this.addVariantOpen = false;
    this.variantKey = "";
    this.variantAudienceDrafts.clear();
    this.variantSheetOpen.clear();
    this.resetCreateExperimentDialog();
    this.resetCreateFlagDialog();
    this.resetCreateAudienceDialog();
    this.resetCreateKeyDialog();
  }
}
