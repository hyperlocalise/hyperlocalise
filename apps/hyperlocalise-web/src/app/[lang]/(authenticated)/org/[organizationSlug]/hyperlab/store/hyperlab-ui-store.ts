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

export class HyperlabUiStore {
  createdSecret: string | null = null;
  addVariantOpen = false;
  variantKey = "";
  variantAudienceDrafts = new Map<string, string>();
  variantSheetOpen = new Map<string, boolean>();

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

  clear() {
    this.createdSecret = null;
    this.addVariantOpen = false;
    this.variantKey = "";
    this.variantAudienceDrafts.clear();
    this.variantSheetOpen.clear();
  }
}
