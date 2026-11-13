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

import { findSegmentIdByKeyOrIdInQueue } from "@/components/content-editor/queue/content-editor-queue-filter";
import type {
  ContentEditorFileContext,
  ContentEditorFormatCheck,
  ContentEditorQueueSegment,
  ContentEditorSegment,
  ContentEditorSegmentIntelligence,
  ContentEditorWorkspaceShell,
  ContentEditorWorkspaceState,
} from "@/components/content-editor/shared/types";

import { resolveCatFileViewCapabilities } from "./content-editor-file-view-capabilities";
import type { ContentEditorIntelligenceStore } from "./store/content-editor-intelligence-store";
import type { ContentEditorQueueStore } from "./store/content-editor-queue-store";
import { ContentEditorSegmentDraft } from "./store/content-editor-segment-draft";
import type { ContentEditorSegmentStore } from "./store/content-editor-segment-store";
import type { ContentEditorSegmentTargetSync } from "./store/content-editor-segment-target-sync";
import { toQueueSegment } from "./store/content-editor-segment-view";
import type { ContentEditorWorkspaceUiStore } from "./store/content-editor-workspace-ui-store";
import {
  collectSegmentsWithAgentContext,
  hasSaveFailureCheck,
  mergeSegmentIntelligenceOnHydrate,
} from "./store/content-editor-workspace-store-utils";

export type ContentEditorSnapshotShell = {
  fileContext: ContentEditorFileContext;
  jobTitle?: string;
  breadcrumbs?: string[];
  primaryActionLabel?: string;
};

type QueueHydratorDependencies = {
  queue: ContentEditorQueueStore;
  segments: ContentEditorSegmentStore;
  intelligence: ContentEditorIntelligenceStore;
  targets: ContentEditorSegmentTargetSync;
  ui: ContentEditorWorkspaceUiStore;
  readShell: () => ContentEditorWorkspaceShell;
  applyShell: (shell: ContentEditorSnapshotShell) => void;
};

const defaultFileContext: ContentEditorFileContext = {
  sourcePath: "",
  filename: "",
  sourceLocale: "en",
  targetLocale: "en",
  providerKind: null,
  canEditTranslations: true,
  canAddComments: false,
};

export const DEFAULT_CONTENT_EDITOR_FILE_CONTEXT = defaultFileContext;

export function resolveFileContext(state: ContentEditorWorkspaceState): ContentEditorFileContext {
  if (state.fileContext) {
    return state.fileContext;
  }

  const firstSegment =
    state.segments?.[0] ??
    (state.queueSegments?.[0]
      ? {
          sourceLocale: defaultFileContext.sourceLocale,
          targetLocale: defaultFileContext.targetLocale,
        }
      : undefined);

  return {
    sourcePath: state.intelligence.filePath ?? "",
    filename: state.breadcrumbs?.[1] ?? "",
    sourceLocale: firstSegment?.sourceLocale ?? defaultFileContext.sourceLocale,
    targetLocale: firstSegment?.targetLocale ?? defaultFileContext.targetLocale,
    providerKind: state.providerKind ?? null,
    canEditTranslations: state.canEditTranslations !== false,
    canAddComments: state.canAddComments === true,
    truncated: Boolean(state.intelligence.constraints),
  };
}

function normalizeSnapshot(state: ContentEditorWorkspaceState): ContentEditorWorkspaceState {
  const queueSegments =
    state.queueSegments.length > 0
      ? state.queueSegments
      : (state.segments ?? []).map(toQueueSegment);

  return {
    ...state,
    fileContext: resolveFileContext(state),
    queueSegments,
  };
}

function queueSnapshotIdentity(state: ContentEditorWorkspaceState): string {
  const queueSegments =
    state.queueSegments.length > 0
      ? state.queueSegments
      : (state.segments ?? []).map((segment) => ({ id: segment.id }));
  return queueSegments.map((segment) => segment.id).join("\0");
}

function intelligenceFromHydratedSegment(
  segment: ContentEditorSegment,
  existing: ContentEditorSegmentIntelligence | undefined,
): ContentEditorSegmentIntelligence | undefined {
  const segmentType = segment.tags?.find(
    (tag) => !tag.includes("comment") && !tag.includes("issue"),
  );
  const patch: Partial<ContentEditorSegmentIntelligence> = {};

  if (segment.contextLabel?.trim()) {
    patch.productMeaning = segment.contextLabel.trim();
  }

  if (segmentType) {
    patch.segmentType = segmentType;
  }

  if (segment.maxLength != null && segment.maxLength > 0) {
    patch.maxLength = segment.maxLength;
  }

  if (Object.keys(patch).length === 0) {
    return existing;
  }

  return {
    glossaryTerms: [],
    ...existing,
    ...patch,
  };
}

/**
 * Ingests queue snapshots from the server. The first snapshot for a file replaces the
 * queue; later pages merge into it while keeping dirty drafts, failed saves, local status
 * overrides, and the selected row.
 */
export class ContentEditorQueueHydrator {
  private hasSnapshot = false;
  private queueIdentity = "";
  private initialSegmentJumpApplied = false;

  constructor(private readonly deps: QueueHydratorDependencies) {
    makeAutoObservable<this, "deps">(this, { deps: false }, { autoBind: true });
  }

  reset() {
    this.hasSnapshot = false;
    this.queueIdentity = "";
    this.initialSegmentJumpApplied = false;
  }

  /**
   * Query loading flags go false on a cache hit before ContentEditorQueryBridge writes
   * this snapshot. Bulk actions must wait until the identities match.
   */
  hasIngested(snapshot: ContentEditorWorkspaceState | null): boolean {
    if (!snapshot) {
      return true;
    }

    return this.queueIdentity === queueSnapshotIdentity(snapshot);
  }

  /** Drops the queue so chrome can keep rendering until the next file's snapshot arrives. */
  clear() {
    this.reset();
    this.applySnapshotQueueMeta([], {});
  }

  hydrate(snapshot: ContentEditorWorkspaceState, initialSegmentKeyOrId?: string | null) {
    const { queue, segments, intelligence, ui } = this.deps;
    const next = normalizeSnapshot(snapshot);
    const isFirstSnapshot = !this.hasSnapshot;
    const currentShell = this.deps.readShell();
    const nextFileContext = next.fileContext ?? defaultFileContext;

    this.deps.applyShell({
      fileContext: nextFileContext,
      jobTitle: next.jobTitle,
      breadcrumbs: next.breadcrumbs,
      primaryActionLabel: next.primaryActionLabel,
    });
    ui.applyFileFamily(this.resolveInitialFamily(next, nextFileContext, initialSegmentKeyOrId));
    intelligence.setFileIntelligence(next.intelligence);

    if (isFirstSnapshot) {
      if (next.segments?.length) {
        this.applySnapshotSegments(next.segments, next.segmentIntelligence);
      } else {
        this.applySnapshotQueueMeta(next.queueSegments, next.segmentIntelligence);
      }
      intelligence.replaceSegmentChecks({ ...next.segmentFormatChecks });
      intelligence.setSelectedChecks(next.formatChecks);
      intelligence.replaceSegments({ ...intelligence.bySegment, ...next.segmentIntelligence });
    } else {
      this.mergeQueueMeta(next);
      this.mergeFormatChecks(currentShell, next);
      this.mergeIntelligence(currentShell, next);
    }

    const currentSelectedId = queue.selectedSegmentId;
    const nextSegmentIds = new Set(next.queueSegments.map((segment) => segment.id));
    const selectedDraftIsDirty = Boolean(segments.drafts.get(currentSelectedId)?.isDirty);
    const retainedSelectedSegmentId =
      (selectedDraftIsDirty || this.deps.targets.isSourceAttached()) &&
      queue.segmentMeta.has(currentSelectedId)
        ? currentSelectedId
        : null;
    queue.select(
      nextSegmentIds.has(currentSelectedId)
        ? currentSelectedId
        : (retainedSelectedSegmentId ??
            next.selectedSegmentId ??
            next.queueSegments[0]?.id ??
            next.segments?.[0]?.id ??
            ""),
    );

    const visibleSegmentIds = new Set(nextSegmentIds);
    if (retainedSelectedSegmentId) {
      visibleSegmentIds.add(retainedSelectedSegmentId);
    }
    queue.reconcileVisibleIds(visibleSegmentIds);

    const matchedSegmentId = initialSegmentKeyOrId
      ? findSegmentIdByKeyOrIdInQueue(queue.segments, initialSegmentKeyOrId)
      : null;
    if (matchedSegmentId && !this.initialSegmentJumpApplied && !selectedDraftIsDirty) {
      this.initialSegmentJumpApplied = true;
      queue.select(matchedSegmentId);
    }

    const selectedSegmentId = queue.selectedSegmentId;
    if (currentShell.selectedSegmentId !== selectedSegmentId) {
      // Snapshot formatChecks are authoritative for the snapshot's selected segment.
      // Prefer them over segmentFormatChecks, which may still hold defaults for that id.
      intelligence.setSelectedChecks(
        selectedSegmentId === next.selectedSegmentId
          ? next.formatChecks
          : (intelligence.segmentFormatChecks[selectedSegmentId] ?? next.formatChecks),
      );
    }

    intelligence.revealAgentContexts(collectSegmentsWithAgentContext(next));

    this.hasSnapshot = true;
    this.queueIdentity = queueSnapshotIdentity(next);
    ui.setTranslationViewLoading(false);
  }

  private resolveInitialFamily(
    next: ContentEditorWorkspaceState,
    fileContext: ContentEditorFileContext,
    initialSegmentKeyOrId: string | null | undefined,
  ) {
    // Seed the persona for the incoming file's content family so auto-detection and
    // per-family localStorage preferences apply immediately.
    if (fileContext.sourcePath !== "*") {
      return resolveCatFileViewCapabilities({
        sourcePath: fileContext.sourcePath,
        providerKind: fileContext.providerKind,
      }).family;
    }

    const matches = (segment: { id: string; key?: string }) =>
      segment.id === initialSegmentKeyOrId || segment.key === initialSegmentKeyOrId;
    const initialSegment =
      (initialSegmentKeyOrId
        ? (next.segments?.find(matches) ?? next.queueSegments?.find(matches))
        : undefined) ??
      next.segments?.[0] ??
      next.queueSegments?.[0];
    return resolveCatFileViewCapabilities({
      sourcePath:
        initialSegment?.sourcePath ??
        (initialSegment as { filePath?: string } | undefined)?.filePath,
      contentKind: initialSegment?.contentKind,
      providerKind: fileContext.providerKind,
    }).family;
  }

  private applySnapshotQueueMeta(
    queueSegments: ContentEditorQueueSegment[],
    segmentIntelligence: ContentEditorWorkspaceState["segmentIntelligence"] = {},
  ) {
    const { queue, segments, intelligence, targets } = this.deps;
    queue.segmentMeta.clear();
    segments.clearSegmentData();
    targets.resetHydration();
    intelligence.replaceSegments({ ...segmentIntelligence });

    for (const meta of queueSegments) {
      queue.upsert(meta);
    }
  }

  private applySnapshotSegments(
    snapshotSegments: ContentEditorSegment[],
    segmentIntelligence: ContentEditorWorkspaceState["segmentIntelligence"],
  ) {
    const { segments, intelligence, targets } = this.deps;
    this.applySnapshotQueueMeta(snapshotSegments.map(toQueueSegment), segmentIntelligence);

    for (const segment of snapshotSegments) {
      targets.markHydrated(segment.id);
      if (segment.comments !== undefined) {
        segments.setComments(segment.id, segment.comments);
      }
      if (segment.hasOpenIssues) {
        segments.setOpenIssueCount(segment.id, 1);
      }
      if (segment.targetText.trim() || segment.status !== "pending") {
        segments.setDraft(
          new ContentEditorSegmentDraft(segment.id, segment.targetText, segment.status),
        );
      }

      const mergedIntelligence = intelligenceFromHydratedSegment(
        segment,
        intelligence.bySegment[segment.id],
      );
      if (mergedIntelligence) {
        intelligence.setSegment(segment.id, mergedIntelligence);
      }
    }
  }

  private mergeQueueMeta(next: ContentEditorWorkspaceState) {
    const { queue, segments, intelligence, targets } = this.deps;
    const nextSegmentIds = new Set(next.queueSegments.map((meta) => meta.id));
    queue.setWindow(nextSegmentIds);
    for (const meta of next.queueSegments) {
      queue.upsert(meta);
      const override = targets.localStatusOverrides.get(meta.id);
      if (!override) {
        continue;
      }

      const draft = segments.drafts.get(meta.id);
      if (draft) {
        draft.applyServerStatus(override);
      } else {
        segments.setDraft(new ContentEditorSegmentDraft(meta.id, "", override));
      }
    }

    for (const segmentId of queue.segmentMeta.keys()) {
      if (nextSegmentIds.has(segmentId)) {
        continue;
      }
      // Keep session-local skipped rows so the Skipped filter can still show them.
      const isRetained =
        segments.drafts.get(segmentId)?.isDirty ||
        targets.localStatusOverrides.has(segmentId) ||
        segments.pendingWrites.has(segmentId) ||
        hasSaveFailureCheck(intelligence.segmentFormatChecks[segmentId] ?? []) ||
        (targets.isSourceAttached() && segmentId === queue.selectedSegmentId);
      if (!isRetained) {
        queue.segmentMeta.delete(segmentId);
        segments.evict(segmentId);
        targets.forget(segmentId);
      }
    }
  }

  private mergeFormatChecks(
    currentShell: ContentEditorWorkspaceShell,
    next: ContentEditorWorkspaceState,
  ) {
    const { queue, segments, intelligence } = this.deps;
    const segmentFormatChecks: Record<string, ContentEditorFormatCheck[]> = {
      ...next.segmentFormatChecks,
    };

    for (const segmentId of queue.segmentMeta.keys()) {
      const currentChecks = currentShell.segmentFormatChecks?.[segmentId];
      if (
        currentChecks &&
        (segments.drafts.get(segmentId)?.isDirty || hasSaveFailureCheck(currentChecks))
      ) {
        segmentFormatChecks[segmentId] = currentChecks;
      }
    }

    intelligence.replaceSegmentChecks(segmentFormatChecks);
    intelligence.setSelectedChecks(
      currentShell.selectedSegmentId === queue.selectedSegmentId
        ? currentShell.formatChecks
        : next.formatChecks,
    );
  }

  private mergeIntelligence(
    currentShell: ContentEditorWorkspaceShell,
    next: ContentEditorWorkspaceState,
  ) {
    const { queue, intelligence } = this.deps;
    const segmentIntelligence: Record<string, ContentEditorSegmentIntelligence> = {
      ...next.segmentIntelligence,
    };

    for (const segmentId of queue.segmentMeta.keys()) {
      const merged = mergeSegmentIntelligenceOnHydrate({
        nextInitialState: next,
        currentState: currentShell,
        segmentId,
        existing: segmentIntelligence[segmentId],
      });
      if (merged) {
        segmentIntelligence[segmentId] = merged;
      }
    }

    intelligence.replaceSegments(segmentIntelligence);
  }
}
