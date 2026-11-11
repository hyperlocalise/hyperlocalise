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
import { makeAutoObservable, reaction } from "mobx";

import type { ProjectFileContentEditorTranslation } from "@/api/routes/project/project.schema";
import { segmentStatusFromTarget } from "@/components/content-editor/project-file/project-file-content-editor-mapper";
import type { ContentEditorSegmentStatus } from "@/components/content-editor/shared/types";

import type { ContentEditorIntelligenceStore } from "./content-editor-intelligence-store";
import type { ContentEditorQueueStore } from "./content-editor-queue-store";
import { ContentEditorSegmentDraft } from "./content-editor-segment-draft";
import type { ContentEditorSegmentStore } from "./content-editor-segment-store";
import { hasSaveFailureCheck } from "./content-editor-workspace-store-utils";

type ServerTarget = ProjectFileContentEditorTranslation;

/**
 * A cache of lazily fetched segment targets (e.g. TanStack Query). The store reads clean
 * targets from it instead of copying them into drafts.
 */
export interface ContentEditorServerTargetSource {
  get(segmentId: string): ServerTarget | null | undefined;
  /** Calls `listener` whenever a cached target settles. Returns an unsubscribe function. */
  subscribe(listener: (segmentId: string, target: ServerTarget | null) => void): () => void;
}

export type ContentEditorSegmentTargetState = {
  targetText: string;
  savedTargetText: string;
  isDirty: boolean;
  status: ContentEditorSegmentStatus;
};

type SegmentTargetStores = {
  queue: ContentEditorQueueStore;
  segments: ContentEditorSegmentStore;
  intelligence: ContentEditorIntelligenceStore;
};

/**
 * Reconciles segment targets arriving from the server with local drafts: snapshot targets,
 * lazily fetched targets, and the responses racing a save.
 */
export class ContentEditorSegmentTargetSync {
  /** Segment ids whose target payload has been applied at least once. */
  hydratedSegmentIds = new Set<string>();
  /**
   * Session-local status overrides (e.g. skip) that are not persisted to the provider.
   * Survive queue hydration so skipped rows do not reappear under Needs Review.
   */
  localStatusOverrides = new Map<string, ContentEditorSegmentStatus>();
  private source: ContentEditorServerTargetSource | undefined;
  /** Bumped when the source settles a segment, so `targetState` readers re-read the source. */
  private readonly sourceVersions = new Map<string, number>();
  /** Target text last committed via save/approve; guards against stale in-flight fetches. */
  private readonly committedTexts = new Map<string, string>();
  /**
   * Saved text captured just before a save. A post-save fetch returning this text is the
   * in-flight pre-save response and must be ignored.
   */
  private readonly preSaveTexts = new Map<string, string>();

  constructor(private readonly stores: SegmentTargetStores) {
    makeAutoObservable<this, "source" | "stores" | "committedTexts" | "preSaveTexts">(
      this,
      { source: false, stores: false, committedTexts: false, preSaveTexts: false },
      { autoBind: true },
    );
  }

  /** True when clean targets are read from a lazy source instead of drafts. */
  isSourceAttached() {
    return this.source !== undefined;
  }

  /**
   * Reads clean targets from `source` and applies every target it settles. Returns a
   * function that detaches it.
   */
  attachSource(source: ContentEditorServerTargetSource) {
    this.source = source;
    const unsubscribe = source.subscribe((segmentId, target) => {
      if (this.stores.queue.segmentMeta.has(segmentId)) {
        this.apply(segmentId, target);
      }
    });
    const disposeRelease = reaction(
      () => [this.stores.segments.pendingWrites.size, this.stores.segments.dirtySegmentIds.size],
      () => this.releaseCleanDrafts(),
    );
    return () => {
      unsubscribe();
      disposeRelease();
      if (this.source === source) {
        this.source = undefined;
      }
    };
  }

  targetState(segmentId: string): ContentEditorSegmentTargetState | undefined {
    const draft = this.stores.segments.drafts.get(segmentId);
    if (draft) return draft;
    this.sourceVersions.get(segmentId);
    const target = this.source?.get(segmentId);
    if (target === undefined) return undefined;
    return {
      targetText: target?.text ?? "",
      savedTargetText: target?.text ?? "",
      isDirty: false,
      status: this.localStatusOverrides.get(segmentId) ?? this.serverStatus(segmentId, target),
    };
  }

  /** Drops clean drafts that only mirror the source, so the source stays the single copy. */
  releaseCleanDrafts() {
    if (!this.source) return;
    const { segments, intelligence } = this.stores;
    for (const [segmentId, draft] of segments.drafts) {
      if (
        !draft.isDirty &&
        !segments.pendingWrites.has(segmentId) &&
        !hasSaveFailureCheck(intelligence.segmentFormatChecks[segmentId] ?? [])
      ) {
        segments.drafts.delete(segmentId);
        this.committedTexts.delete(segmentId);
        this.preSaveTexts.delete(segmentId);
      }
    }
  }

  apply(segmentId: string, target: ServerTarget | null) {
    const { queue, segments } = this.stores;
    const existingMeta = queue.segmentMeta.get(segmentId);
    if (!existingMeta) {
      return;
    }

    const targetText = target?.text ?? "";
    const status = this.localStatusOverrides.get(segmentId) ?? this.serverStatus(segmentId, target);
    const nextContentKind = target?.contentKind ?? existingMeta.contentKind;
    const nextTargetAssetUrl =
      target?.targetAssetUrl !== undefined ? target.targetAssetUrl : existingMeta.targetAssetUrl;
    const nextImageVariantId =
      target?.imageVariantId !== undefined ? target.imageVariantId : existingMeta.imageVariantId;
    if (
      existingMeta.contentKind !== nextContentKind ||
      existingMeta.targetAssetUrl !== nextTargetAssetUrl ||
      existingMeta.imageVariantId !== nextImageVariantId
    ) {
      queue.upsert({
        ...existingMeta,
        ...(nextContentKind ? { contentKind: nextContentKind } : {}),
        ...(nextTargetAssetUrl !== undefined ? { targetAssetUrl: nextTargetAssetUrl } : {}),
        ...(nextImageVariantId !== undefined ? { imageVariantId: nextImageVariantId } : {}),
      });
    }

    const existingDraft = segments.drafts.get(segmentId);
    if (this.source) {
      this.sourceVersions.set(segmentId, (this.sourceVersions.get(segmentId) ?? 0) + 1);
      existingDraft?.applyServerStatus(status);
      this.markHydrated(segmentId);
      return;
    }

    if (!existingDraft) {
      segments.setDraft(new ContentEditorSegmentDraft(segmentId, targetText, status));
      this.markHydrated(segmentId);
      return;
    }

    if (existingDraft.isDirty) {
      existingDraft.applyServerStatus(status);
      this.markHydrated(segmentId);
      return;
    }

    const committedText = this.committedTexts.get(segmentId);
    if (committedText !== undefined && committedText === existingDraft.savedTargetText) {
      if (targetText !== committedText && this.preSaveTexts.get(segmentId) === targetText) {
        // In-flight pre-save fetch — ignore without clearing the guard.
        this.markHydrated(segmentId);
        return;
      }

      // Exact match or server-normalized confirmation — clear and apply.
      this.committedTexts.delete(segmentId);
      this.preSaveTexts.delete(segmentId);
    }

    if (existingDraft.targetText.trim() && !targetText.trim()) {
      existingDraft.applyServerStatus(status);
    } else {
      existingDraft.applyServerTarget(targetText, status);
    }
    this.markHydrated(segmentId);
  }

  /** Seeds a draft from the lazy source before the first edit, so it starts from the server text. */
  ensureDraftForEdit(segmentId: string) {
    if (!this.source || this.stores.segments.drafts.has(segmentId)) {
      return;
    }
    const target = this.targetState(segmentId);
    this.stores.segments.setDraft(
      new ContentEditorSegmentDraft(
        segmentId,
        target?.targetText ?? "",
        target?.status ?? "pending",
      ),
    );
  }

  markSaved(segmentId: string, targetText: string, status?: ContentEditorSegmentStatus) {
    const { queue, segments } = this.stores;
    const draft = segments.drafts.get(segmentId);
    if (draft) {
      this.preSaveTexts.set(segmentId, draft.savedTargetText);
    }
    segments.markSaved(segmentId, targetText, status, queue.segmentMeta.has(segmentId));
    this.committedTexts.set(segmentId, targetText);
  }

  markHydrated(segmentId: string) {
    this.hydratedSegmentIds.add(segmentId);
    this.stores.segments.clearTargetLoadFailed(segmentId);
  }

  hasHydrated(segmentId: string) {
    return this.hydratedSegmentIds.has(segmentId);
  }

  hasFailed(segmentId: string) {
    return this.stores.segments.failedTargetSegmentIds.has(segmentId);
  }

  markLoadFailed(segmentId: string) {
    if (this.hasHydrated(segmentId) || this.hasFailed(segmentId)) {
      return;
    }
    this.stores.segments.markTargetLoadFailed(segmentId);
  }

  rememberLocalStatusOverride(segmentId: string, status: ContentEditorSegmentStatus) {
    this.localStatusOverrides.set(segmentId, status);
  }

  /** Forgets one segment, e.g. when it leaves the loaded queue window. */
  forget(segmentId: string) {
    this.hydratedSegmentIds.delete(segmentId);
    this.sourceVersions.delete(segmentId);
    this.committedTexts.delete(segmentId);
    this.preSaveTexts.delete(segmentId);
    this.stores.segments.clearTargetLoadFailed(segmentId);
  }

  /** A full snapshot replaces every target, so prior hydration and save guards no longer apply. */
  resetHydration() {
    this.hydratedSegmentIds = new Set();
    this.committedTexts.clear();
    this.preSaveTexts.clear();
    this.stores.segments.clearFailedTargetSegmentIds();
  }

  resetForFileScope() {
    this.resetHydration();
    this.localStatusOverrides = new Map();
  }

  private serverStatus(segmentId: string, target: ServerTarget | null) {
    return segmentStatusFromTarget(
      {
        hasOpenIssues: this.stores.segments.hasOpenIssues(segmentId),
        groupStatus: this.stores.queue.segmentMeta.get(segmentId)?.groupStatus,
      },
      target,
    );
  }
}
