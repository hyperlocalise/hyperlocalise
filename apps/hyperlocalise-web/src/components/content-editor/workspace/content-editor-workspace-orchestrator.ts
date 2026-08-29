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
import { computed, makeAutoObservable, reaction, runInAction, type IReactionDisposer } from "mobx";

import type {
  ProjectFileContentEditorComment,
  ProjectFileContentEditorTranslation,
} from "@/api/routes/project/project.schema";
import {
  findSegmentIdByKeyOrIdInQueue,
  isOpenIssueStatus,
  isServerQueueFilter,
  orderCatQueueSegmentsSkippedLast,
  segmentMatchesQueueFilterFromInput,
  type ContentEditorQueueFilter,
  type ContentEditorQueueSort,
} from "@/components/content-editor/queue/content-editor-queue-filter";
import type {
  ContentEditorFileContext,
  ContentEditorFormatCheck,
  ContentEditorQueueSegment,
  ContentEditorSegment,
  ContentEditorSegmentComment,
  ContentEditorSegmentIntelligence,
  ContentEditorSegmentStatus,
  ContentEditorWorkspaceShell,
  ContentEditorWorkspaceState,
} from "@/components/content-editor/shared/types";

import {
  segmentStatusFromTarget,
  mapSegmentComments,
} from "@/components/content-editor/project-file/project-file-content-editor-mapper";

import type { ContentEditorWorkspaceViewMode } from "./content-editor-workspace-view-mode";
import { ContentEditorIntelligenceStore } from "./store/content-editor-intelligence-store";
import { ContentEditorQueueStore } from "./store/content-editor-queue-store";
import { ContentEditorSegmentDraft } from "./store/content-editor-segment-draft";
import { ContentEditorSegmentStore } from "./store/content-editor-segment-store";
import { ContentEditorWorkspaceUiStore } from "./store/content-editor-workspace-ui-store";
import { composeSegmentView, toQueueSegment } from "./store/content-editor-segment-view";
import {
  collectSegmentsWithAgentContext,
  hasSaveFailureCheck,
  mergeSegmentIntelligenceOnHydrate,
} from "./store/content-editor-workspace-store-utils";

export type CreateCatWorkspaceOptions = {
  initialViewMode?: ContentEditorWorkspaceViewMode;
  initialQueueFilter?: ContentEditorQueueFilter;
  initialQueueSort?: ContentEditorQueueSort;
  initialSearch?: string;
};

type UnsavedNavigationPrompt = {
  proceed: () => void;
};

interface WorkspaceControllerLifecycle {
  start(): void;
  dispose(): void;
}

const defaultFileContext: ContentEditorFileContext = {
  sourcePath: "",
  filename: "",
  sourceLocale: "en",
  targetLocale: "en",
  providerKind: null,
  canEditTranslations: true,
  canAddComments: false,
};

function normalizeSnapshot(state: ContentEditorWorkspaceState): ContentEditorWorkspaceState {
  const fileContext = resolveFileContext(state);
  const queueSegments =
    state.queueSegments.length > 0
      ? state.queueSegments
      : (state.segments ?? []).map(toQueueSegment);

  return {
    ...state,
    fileContext,
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

const EMPTY_LOADING_SEGMENT_IDS: ReadonlySet<string> = new Set<string>();

function loadingSegmentIdsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left === right) {
    return true;
  }
  if (left.size !== right.size) {
    return false;
  }
  for (const id of left) {
    if (!right.has(id)) {
      return false;
    }
  }
  return true;
}

export class ContentEditorWorkspaceOrchestrator {
  readonly queue = new ContentEditorQueueStore();
  readonly segments = new ContentEditorSegmentStore();
  readonly intelligenceState = new ContentEditorIntelligenceStore();
  readonly ui: ContentEditorWorkspaceUiStore;

  jobTitle?: string;
  breadcrumbs?: string[];
  primaryActionLabel?: string;

  fileContext: ContentEditorFileContext = defaultFileContext;

  isApproving = false;
  isSavingDraft = false;
  isBulkActionPending = false;

  unsavedNavigationPrompt: UnsavedNavigationPrompt | null = null;

  private lastHydratedSnapshot: ContentEditorWorkspaceState | null = null;
  private lastHydratedQueueIdentity = "";
  private initialSegmentJumpApplied = false;
  /** Segment ids whose lazy (or snapshot) target payload has been applied at least once. */
  hydratedTargetSegmentIds = new Set<string>();
  /**
   * Target text last committed via save/approve. Guards applySegmentTarget against
   * stale lazy fetches that were in flight before the save completed.
   */
  private locallyCommittedTargetTexts = new Map<string, string>();
  /**
   * Draft saved text captured just before markSegmentSaved. A post-save lazy sync
   * whose text equals this value is the in-flight pre-save response and must be
   * ignored. Any other mismatch (e.g. server-normalized text) clears the guard.
   */
  private preSaveTargetTexts = new Map<string, string>();
  /**
   * Session-local status overrides (e.g. skip) that are not persisted to the provider.
   * Survives queue hydration so skipped rows do not reappear under Needs Review.
   */
  localStatusOverrides = new Map<string, ContentEditorSegmentStatus>();

  validationSequence = 0;
  reviewSequence = 0;
  private controllers: WorkspaceControllerLifecycle[] = [];
  private dirtyStateDisposer?: IReactionDisposer;
  private beforeUnloadHandler?: (event: BeforeUnloadEvent) => void;

  constructor(options?: CreateCatWorkspaceOptions) {
    this.ui = new ContentEditorWorkspaceUiStore(options?.initialViewMode);
    this.queue.filter = options?.initialQueueFilter ?? "all";
    this.queue.sort = options?.initialQueueSort ?? "file_order";
    this.queue.search = options?.initialSearch ?? "";
    makeAutoObservable(
      this,
      {
        validationSequence: false,
        reviewSequence: false,
        loadingSegmentIds: computed({ equals: loadingSegmentIdsEqual }),
      },
      { autoBind: true },
    );
  }

  attachControllers(...controllers: WorkspaceControllerLifecycle[]) {
    this.controllers = controllers;
  }

  start() {
    for (const controller of this.controllers) {
      controller.start();
    }
    this.dirtyStateDisposer?.();
    if (typeof window !== "undefined") {
      if (this.beforeUnloadHandler) {
        window.removeEventListener("beforeunload", this.beforeUnloadHandler);
      }
      const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
      this.beforeUnloadHandler = handleBeforeUnload;
      this.dirtyStateDisposer = reaction(
        () => this.segments.hasDirtySegments,
        (hasDirtySegments, previousHasDirtySegments) => {
          if (previousHasDirtySegments) {
            window.removeEventListener("beforeunload", handleBeforeUnload);
          }
          if (hasDirtySegments) {
            window.addEventListener("beforeunload", handleBeforeUnload);
          }
        },
        { fireImmediately: true },
      );
    }
  }

  dispose() {
    this.dirtyStateDisposer?.();
    this.dirtyStateDisposer = undefined;
    if (this.beforeUnloadHandler && typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this.beforeUnloadHandler);
      this.beforeUnloadHandler = undefined;
    }
    for (const controller of this.controllers) {
      controller.dispose();
    }
  }

  get selectedSegmentId() {
    return this.queue.selectedSegmentId;
  }

  set selectedSegmentId(value: string) {
    this.queue.selectedSegmentId = value;
  }

  get queueFilter() {
    return this.queue.filter;
  }

  set queueFilter(value: ContentEditorQueueFilter) {
    this.queue.filter = value;
  }

  get queueSort() {
    return this.queue.sort;
  }

  set queueSort(value: ContentEditorQueueSort) {
    this.queue.sort = value;
  }

  get queueSearch() {
    return this.queue.search;
  }

  set queueSearch(value: string) {
    this.queue.search = value;
  }

  get selectionMode() {
    return this.queue.selectionMode;
  }

  get checkedSegmentIds() {
    return this.queue.checkedSegmentIds;
  }

  set checkedSegmentIds(value: Set<string>) {
    this.queue.checkedSegmentIds = value;
  }

  get segmentMeta() {
    return this.queue.segmentMeta;
  }

  get segmentComments() {
    return this.segments.comments;
  }

  set segmentComments(value: Map<string, ContentEditorSegmentComment[]>) {
    this.segments.comments = value;
  }

  get drafts() {
    return this.segments.drafts;
  }

  get formatChecks() {
    return this.intelligenceState.formatChecks;
  }

  set formatChecks(value: ContentEditorFormatCheck[]) {
    this.intelligenceState.formatChecks = value;
  }

  get segmentFormatChecks() {
    return this.intelligenceState.segmentFormatChecks;
  }

  set segmentFormatChecks(value: Record<string, ContentEditorFormatCheck[]>) {
    this.intelligenceState.segmentFormatChecks = value;
  }

  get intelligence() {
    return this.intelligenceState.fileIntelligence;
  }

  set intelligence(value: ContentEditorSegmentIntelligence) {
    this.intelligenceState.fileIntelligence = value;
  }

  get segmentIntelligence() {
    return this.intelligenceState.bySegment;
  }

  set segmentIntelligence(value: Record<string, ContentEditorSegmentIntelligence>) {
    this.intelligenceState.bySegment = value;
  }

  get revealedAgentContextSegmentIds() {
    return this.intelligenceState.revealedAgentContextSegmentIds;
  }

  set revealedAgentContextSegmentIds(value: Set<string>) {
    this.intelligenceState.revealedAgentContextSegmentIds = value;
  }

  get isValidating() {
    return this.intelligenceState.isValidating;
  }

  set isValidating(value: boolean) {
    this.intelligenceState.isValidating = value;
  }

  get isPostingComment() {
    return this.segments.isPostingComment;
  }

  set isPostingComment(value: boolean) {
    this.segments.isPostingComment = value;
  }

  get isResolvingComment() {
    return this.segments.isResolvingComment;
  }

  set isResolvingComment(value: boolean) {
    this.segments.isResolvingComment = value;
  }

  get resolvingCommentId() {
    return this.segments.resolvingCommentId;
  }

  set resolvingCommentId(value: string | null) {
    this.segments.resolvingCommentId = value;
  }

  get commentPostError() {
    return this.segments.commentPostError;
  }

  set commentPostError(value: string | undefined) {
    this.segments.commentPostError = value;
  }

  get isLookingUpContext() {
    const selectedSegmentId =
      this.findSegmentIdByKeyOrId(this.selectedSegmentId) ?? this.selectedSegmentId;
    return this.intelligenceState.contextLoadingSegmentIds.has(selectedSegmentId);
  }

  get concordanceLoadingSegmentId() {
    return this.intelligenceState.concordanceLoadingSegmentId;
  }

  set concordanceLoadingSegmentId(value: string | null) {
    this.intelligenceState.concordanceLoadingSegmentId = value;
  }

  get isLoadingVisualContext() {
    return this.intelligenceState.isLoadingVisualContext;
  }

  set isLoadingVisualContext(value: boolean) {
    this.intelligenceState.isLoadingVisualContext = value;
  }

  get isGeneratingAiRecommendation() {
    return this.intelligenceState.isGeneratingAiRecommendation;
  }

  set isGeneratingAiRecommendation(value: boolean) {
    this.intelligenceState.isGeneratingAiRecommendation = value;
  }

  get isRunningFormatChecks() {
    return this.intelligenceState.isRunningFormatChecks;
  }

  set isRunningFormatChecks(value: boolean) {
    this.intelligenceState.isRunningFormatChecks = value;
  }

  get formatCheckLoadingSegmentIds(): ReadonlySet<string> {
    return this.intelligenceState.formatCheckLoadingSegmentIds;
  }

  setFormatCheckLoading(segmentId: string, loading: boolean) {
    this.intelligenceState.setFormatCheckLoading(segmentId, loading);
  }

  clearFormatCheckLoading() {
    this.intelligenceState.clearFormatCheckLoading();
  }

  get isSegmentTargetLoading() {
    return this.segments.isTargetLoading;
  }

  set isSegmentTargetLoading(value: boolean) {
    this.segments.isTargetLoading = value;
  }

  get isCommentsLoading() {
    return this.segments.isCommentsLoading;
  }

  set isCommentsLoading(value: boolean) {
    this.segments.isCommentsLoading = value;
  }

  get canEditTranslations() {
    return this.fileContext.canEditTranslations;
  }

  get canAddComments() {
    return this.fileContext.canAddComments;
  }

  get providerKind() {
    return this.fileContext.providerKind;
  }

  get isLoadingConcordance() {
    const selectedSegmentId =
      this.findSegmentIdByKeyOrId(this.selectedSegmentId) ?? this.selectedSegmentId;
    return (
      this.concordanceLoadingSegmentId !== null &&
      this.concordanceLoadingSegmentId === selectedSegmentId
    );
  }

  get dirtySegmentIds(): ReadonlySet<string> {
    return this.segments.dirtySegmentIds;
  }

  get queueSegments(): ContentEditorQueueSegment[] {
    return this.queue.segments;
  }

  get shellState(): ContentEditorWorkspaceShell {
    return {
      fileContext: this.fileContext,
      selectedSegmentId: this.selectedSegmentId,
      formatChecks: this.formatChecks,
      segmentFormatChecks: this.segmentFormatChecks,
      intelligence: this.intelligence,
      segmentIntelligence: this.segmentIntelligence,
      jobTitle: this.jobTitle,
      breadcrumbs: this.breadcrumbs,
      primaryActionLabel: this.primaryActionLabel,
      canEditTranslations: this.canEditTranslations,
      canAddComments: this.canAddComments,
      providerKind: this.providerKind,
    };
  }

  getSegmentView(segmentId: string): ContentEditorSegment | undefined {
    const meta = this.segmentMeta.get(segmentId);
    if (!meta) {
      return undefined;
    }

    return composeSegmentView({
      fileContext: this.fileContext,
      meta,
      draft: this.drafts.get(segmentId),
      comments: this.segmentComments.get(segmentId),
      openIssueCount: this.segments.openIssueCounts.get(segmentId),
      intelligence: this.segmentIntelligence[segmentId],
    });
  }

  findSegmentIdByKeyOrId(segmentIdOrKey: string) {
    return findSegmentIdByKeyOrIdInQueue(this.queueSegments, segmentIdOrKey);
  }

  segmentHasOpenIssues(segmentId: string) {
    const openFromSheet = (this.segments.openIssueCounts.get(segmentId) ?? 0) > 0;
    if (openFromSheet) {
      return true;
    }

    return (
      this.segmentComments
        .get(segmentId)
        ?.some((comment) => comment.type === "issue" && isOpenIssueStatus(comment.status)) ?? false
    );
  }

  matchesQueueFilter(segmentId: string, filter: ContentEditorQueueFilter) {
    const draft = this.drafts.get(segmentId);
    return segmentMatchesQueueFilterFromInput(
      {
        status: draft?.status ?? "pending",
        hasOpenIssues: this.segmentHasOpenIssues(segmentId),
        isHidden: this.segmentMeta.get(segmentId)?.isHidden,
        isDirty: draft?.isDirty,
      },
      filter,
    );
  }

  getFilteredQueueSegments(filter: ContentEditorQueueFilter, usesServerQueueFilter: boolean) {
    let segments: ContentEditorQueueSegment[];

    if (usesServerQueueFilter && isServerQueueFilter(filter)) {
      if (this.localStatusOverrides.size === 0) {
        segments = this.queueSegments;
      } else {
        // Trust the server page, but hide rows whose session-local status no longer
        // matches (skip is not persisted; approve may race ahead of refetch).
        segments = this.queueSegments.filter((meta) => {
          if (!this.localStatusOverrides.has(meta.id)) {
            return true;
          }
          return this.matchesQueueFilter(meta.id, filter);
        });
      }
    } else if (filter === "all") {
      segments = this.queueSegments;
    } else {
      segments = this.queueSegments.filter((meta) => this.matchesQueueFilter(meta.id, filter));
    }

    return orderCatQueueSegmentsSkippedLast(segments, this.queue.sort, (meta) => {
      const draft = this.drafts.get(meta.id);
      return (draft?.status ?? "pending") === "skipped";
    });
  }

  getQueuePanelSegments(
    filter: ContentEditorQueueFilter,
    usesServerQueueFilter: boolean,
  ): ContentEditorSegment[] {
    return this.getFilteredQueueSegments(filter, usesServerQueueFilter).flatMap((meta) => {
      const view = this.getSegmentView(meta.id);
      if (!view) {
        return [];
      }

      return [view];
    });
  }

  get selectedSegmentView(): ContentEditorSegment | undefined {
    const segmentId = this.findSegmentIdByKeyOrId(this.selectedSegmentId) ?? this.selectedSegmentId;
    return this.getSegmentView(segmentId);
  }

  get intelligenceSegmentId() {
    return this.ui.hoveredSegmentId ?? this.selectedSegmentId;
  }

  get intelligenceSegmentView(): ContentEditorSegment | undefined {
    const segmentId =
      this.findSegmentIdByKeyOrId(this.intelligenceSegmentId) ?? this.intelligenceSegmentId;
    if (!segmentId) {
      return undefined;
    }

    return this.getSegmentView(segmentId);
  }

  get loadingSegmentIds(): ReadonlySet<string> {
    const hasSelectedLoading = this.isSegmentTargetLoading && this.selectedSegmentId;
    const hasPreviewLoading = this.ui.previewTargetLoading && this.ui.previewLoadingSegmentId;
    const queueLoadingIds = this.segments.queueTargetLoadingSegmentIds;

    if (!hasSelectedLoading && !hasPreviewLoading && queueLoadingIds.size === 0) {
      return EMPTY_LOADING_SEGMENT_IDS;
    }

    const ids = new Set<string>();
    for (const segmentId of queueLoadingIds) {
      // Read drafts here so MobX recomputes when the user types during a fetch.
      if (!this.drafts.get(segmentId)?.targetText.trim()) {
        ids.add(segmentId);
      }
    }
    if (hasSelectedLoading) {
      ids.add(this.selectedSegmentId);
    }
    if (hasPreviewLoading && this.ui.previewLoadingSegmentId) {
      ids.add(this.ui.previewLoadingSegmentId);
    }
    return ids;
  }

  get isIntelligenceCommentsLoading() {
    const segmentId = this.intelligenceSegmentId;
    if (!segmentId) {
      return false;
    }

    if (segmentId === this.selectedSegmentId) {
      return this.isCommentsLoading;
    }

    return this.ui.previewCommentsLoading;
  }

  get selectedDraft(): ContentEditorSegmentDraft | undefined {
    const segmentId = this.findSegmentIdByKeyOrId(this.selectedSegmentId) ?? this.selectedSegmentId;
    return this.drafts.get(segmentId);
  }

  reset(initialState: ContentEditorWorkspaceState, initialSegmentKeyOrId?: string | null) {
    this.lastHydratedSnapshot = null;
    this.lastHydratedQueueIdentity = "";
    this.initialSegmentJumpApplied = false;
    this.hydratedTargetSegmentIds = new Set();
    this.locallyCommittedTargetTexts = new Map();
    this.preSaveTargetTexts = new Map();
    this.localStatusOverrides = new Map();
    this.ingestQueue(initialState, initialSegmentKeyOrId);
  }

  hasHydratedTarget(segmentId: string) {
    return this.hydratedTargetSegmentIds.has(segmentId);
  }

  ingestQueue(
    nextInitialState: ContentEditorWorkspaceState,
    initialSegmentKeyOrId?: string | null,
  ) {
    this.hydrateFromServerSnapshot(nextInitialState, initialSegmentKeyOrId);
  }

  /**
   * Query loading flags go false on a cache hit before ContentEditorQueryBridge writes
   * this snapshot. Bulk actions must wait until the identities match.
   */
  hasIngestedQueueSnapshot(snapshot: ContentEditorWorkspaceState | null): boolean {
    if (!snapshot) {
      return true;
    }

    return this.lastHydratedQueueIdentity === queueSnapshotIdentity(snapshot);
  }

  hydrateFromServerSnapshot(
    nextInitialState: ContentEditorWorkspaceState,
    initialSegmentKeyOrId?: string | null,
  ) {
    const normalizedNext = normalizeSnapshot(nextInitialState);
    const previousInitialState = this.lastHydratedSnapshot;
    const currentShell = this.shellState;
    const nextFileContext = resolveFileContext(normalizedNext);

    runInAction(() => {
      this.fileContext = nextFileContext;
      this.jobTitle = normalizedNext.jobTitle;
      this.breadcrumbs = normalizedNext.breadcrumbs;
      this.primaryActionLabel = normalizedNext.primaryActionLabel;
      this.intelligence = normalizedNext.intelligence;

      if (!previousInitialState) {
        if (normalizedNext.segments?.length) {
          this.applySnapshotSegments(normalizedNext.segments, normalizedNext.segmentIntelligence);
        } else {
          this.applySnapshotQueueMeta(
            normalizedNext.queueSegments,
            normalizedNext.segmentIntelligence,
          );
        }
        this.segmentFormatChecks = { ...normalizedNext.segmentFormatChecks };
        this.formatChecks = normalizedNext.formatChecks;
        this.segmentIntelligence = {
          ...this.segmentIntelligence,
          ...normalizedNext.segmentIntelligence,
        };
      } else {
        this.mergeQueueMetaFromSnapshot(normalizedNext);
        this.mergeFormatChecksFromHydration(currentShell, normalizedNext);
        this.mergeIntelligenceFromHydration(currentShell, normalizedNext);
      }

      const nextSegmentIds = new Set(normalizedNext.queueSegments.map((segment) => segment.id));
      const selectedDraftIsDirty = Boolean(this.drafts.get(this.selectedSegmentId)?.isDirty);
      const retainedSelectedSegmentId =
        selectedDraftIsDirty && this.segmentMeta.has(this.selectedSegmentId)
          ? this.selectedSegmentId
          : null;
      const selectedSegmentId = nextSegmentIds.has(this.selectedSegmentId)
        ? this.selectedSegmentId
        : (retainedSelectedSegmentId ??
          normalizedNext.selectedSegmentId ??
          normalizedNext.queueSegments[0]?.id ??
          normalizedNext.segments?.[0]?.id ??
          "");

      this.selectedSegmentId = selectedSegmentId;
      const visibleSegmentIds = new Set(nextSegmentIds);
      if (retainedSelectedSegmentId) {
        visibleSegmentIds.add(retainedSelectedSegmentId);
      }
      this.queue.reconcileVisibleIds(visibleSegmentIds);

      const matchedSegmentId = initialSegmentKeyOrId
        ? this.findSegmentIdByKeyOrId(initialSegmentKeyOrId)
        : null;
      if (matchedSegmentId && !this.initialSegmentJumpApplied && !selectedDraftIsDirty) {
        this.initialSegmentJumpApplied = true;
        this.selectedSegmentId = matchedSegmentId;
      }

      if (currentShell.selectedSegmentId !== this.selectedSegmentId) {
        // Snapshot formatChecks are authoritative for the snapshot's selected segment.
        // Prefer them over segmentFormatChecks, which may still hold defaults for that id.
        this.formatChecks =
          this.selectedSegmentId === normalizedNext.selectedSegmentId
            ? normalizedNext.formatChecks
            : (this.segmentFormatChecks[this.selectedSegmentId] ?? normalizedNext.formatChecks);
      }

      this.revealedAgentContextSegmentIds = new Set([
        ...this.revealedAgentContextSegmentIds,
        ...collectSegmentsWithAgentContext(normalizedNext),
      ]);

      this.lastHydratedSnapshot = normalizedNext;
      this.lastHydratedQueueIdentity = queueSnapshotIdentity(normalizedNext);
    });
  }

  applySegmentTarget(segmentId: string, target: ProjectFileContentEditorTranslation | null) {
    if (!this.segmentMeta.has(segmentId)) {
      return;
    }

    const targetText = target?.text ?? "";
    const serverStatus = segmentStatusFromTarget(
      { hasOpenIssues: this.segmentHasOpenIssues(segmentId) },
      target,
    );
    const status = this.localStatusOverrides.get(segmentId) ?? serverStatus;
    const existingMeta = this.segmentMeta.get(segmentId);
    if (existingMeta) {
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
        this.segmentMeta.set(segmentId, {
          ...existingMeta,
          ...(nextContentKind ? { contentKind: nextContentKind } : {}),
          ...(nextTargetAssetUrl !== undefined ? { targetAssetUrl: nextTargetAssetUrl } : {}),
          ...(nextImageVariantId !== undefined ? { imageVariantId: nextImageVariantId } : {}),
        });
      }
    }

    const existingDraft = this.drafts.get(segmentId);

    if (existingDraft) {
      if (existingDraft.isDirty) {
        existingDraft.applyServerStatus(status);
        this.hydratedTargetSegmentIds.add(segmentId);
        return;
      }

      const committedText = this.locallyCommittedTargetTexts.get(segmentId);
      if (committedText !== undefined && committedText === existingDraft.savedTargetText) {
        if (targetText !== committedText) {
          const preSaveText = this.preSaveTargetTexts.get(segmentId);
          if (preSaveText !== undefined && targetText === preSaveText) {
            // In-flight pre-save fetch — ignore without clearing the guard.
            this.hydratedTargetSegmentIds.add(segmentId);
            return;
          }
        }

        // Exact match or server-normalized confirmation — clear and apply.
        this.locallyCommittedTargetTexts.delete(segmentId);
        this.preSaveTargetTexts.delete(segmentId);
      }

      if (existingDraft.targetText.trim() && !targetText.trim()) {
        existingDraft.applyServerStatus(status);
        this.hydratedTargetSegmentIds.add(segmentId);
        return;
      }

      existingDraft.applyServerTarget(targetText, status);
      this.hydratedTargetSegmentIds.add(segmentId);
      return;
    }

    this.drafts.set(segmentId, new ContentEditorSegmentDraft(segmentId, targetText, status));
    this.hydratedTargetSegmentIds.add(segmentId);
  }

  applySegmentComments(segmentId: string, comments: ProjectFileContentEditorComment[]) {
    if (!this.segmentMeta.has(segmentId)) {
      return;
    }

    const mappedComments = mapSegmentComments(comments);
    this.segmentComments.set(segmentId, mappedComments);

    const hasOpenIssues = this.segmentHasOpenIssues(segmentId);
    const draft = this.drafts.get(segmentId);
    if (
      draft &&
      hasOpenIssues &&
      draft.status !== "reviewed" &&
      this.localStatusOverrides.get(segmentId) !== "skipped"
    ) {
      draft.applyServerStatus("needs_review");
    }
  }

  applySegmentOpenIssueCount(segmentId: string, openIssueCount: number) {
    if (!this.segmentMeta.has(segmentId)) {
      return;
    }

    this.segments.openIssueCounts.set(segmentId, openIssueCount);

    const draft = this.drafts.get(segmentId);
    if (
      draft &&
      openIssueCount > 0 &&
      draft.status !== "reviewed" &&
      this.localStatusOverrides.get(segmentId) !== "skipped"
    ) {
      draft.applyServerStatus("needs_review");
    }
  }

  setSegmentTargetLoading(loading: boolean) {
    this.isSegmentTargetLoading = loading;
  }

  setQueueTargetLoadingSegmentIds(segmentIds: readonly string[]) {
    this.segments.setQueueTargetLoadingSegmentIds(segmentIds);
  }

  setCommentsLoading(loading: boolean) {
    this.isCommentsLoading = loading;
  }

  private applySnapshotQueueMeta(
    queueSegments: ContentEditorQueueSegment[],
    segmentIntelligence: ContentEditorWorkspaceState["segmentIntelligence"] = {},
  ) {
    this.segmentMeta.clear();
    this.segmentComments.clear();
    this.segments.openIssueCounts.clear();
    this.drafts.clear();
    this.hydratedTargetSegmentIds = new Set();
    this.locallyCommittedTargetTexts = new Map();
    this.preSaveTargetTexts = new Map();
    this.segmentIntelligence = { ...segmentIntelligence };

    for (const meta of queueSegments) {
      this.segmentMeta.set(meta.id, meta);
    }
  }

  private applySnapshotSegments(
    segments: ContentEditorSegment[],
    segmentIntelligence: ContentEditorWorkspaceState["segmentIntelligence"],
  ) {
    this.segmentMeta.clear();
    this.segmentComments.clear();
    this.segments.openIssueCounts.clear();
    this.drafts.clear();
    this.hydratedTargetSegmentIds = new Set();
    this.locallyCommittedTargetTexts = new Map();
    this.preSaveTargetTexts = new Map();
    this.segmentIntelligence = { ...segmentIntelligence };

    for (const segment of segments) {
      this.segmentMeta.set(segment.id, toQueueSegment(segment));
      this.hydratedTargetSegmentIds.add(segment.id);
      if (segment.comments !== undefined) {
        this.segmentComments.set(segment.id, segment.comments);
      }
      if (segment.hasOpenIssues) {
        this.segments.openIssueCounts.set(segment.id, 1);
      }
      if (segment.targetText.trim() || segment.status !== "pending") {
        this.drafts.set(
          segment.id,
          new ContentEditorSegmentDraft(segment.id, segment.targetText, segment.status),
        );
      }

      const mergedIntelligence = intelligenceFromHydratedSegment(
        segment,
        this.segmentIntelligence[segment.id],
      );
      if (mergedIntelligence) {
        this.segmentIntelligence[segment.id] = mergedIntelligence;
      }
    }
  }

  private mergeQueueMetaFromSnapshot(nextInitialState: ContentEditorWorkspaceState) {
    for (const meta of nextInitialState.queueSegments) {
      this.segmentMeta.set(meta.id, meta);
      const override = this.localStatusOverrides.get(meta.id);
      if (!override) {
        continue;
      }

      const draft = this.drafts.get(meta.id);
      if (draft) {
        draft.applyServerStatus(override);
      } else {
        this.drafts.set(meta.id, new ContentEditorSegmentDraft(meta.id, "", override));
      }
    }

    const nextSegmentIds = new Set(nextInitialState.queueSegments.map((meta) => meta.id));
    for (const segmentId of this.segmentMeta.keys()) {
      if (!nextSegmentIds.has(segmentId)) {
        const draft = this.drafts.get(segmentId);
        const hasLocalOverride = this.localStatusOverrides.has(segmentId);
        // Keep session-local skipped rows so the Skipped filter can still show them.
        if (!draft?.isDirty && !hasLocalOverride) {
          this.drafts.delete(segmentId);
          this.segmentMeta.delete(segmentId);
          this.segmentComments.delete(segmentId);
          this.segments.openIssueCounts.delete(segmentId);
          this.hydratedTargetSegmentIds.delete(segmentId);
          this.locallyCommittedTargetTexts.delete(segmentId);
          this.preSaveTargetTexts.delete(segmentId);
        }
      }
    }
  }

  private mergeFormatChecksFromHydration(
    currentShell: ContentEditorWorkspaceShell,
    nextInitialState: ContentEditorWorkspaceState,
  ) {
    const segmentFormatChecks: Record<string, ContentEditorFormatCheck[]> = {
      ...nextInitialState.segmentFormatChecks,
    };

    for (const segmentId of this.segmentMeta.keys()) {
      const currentDraft = this.drafts.get(segmentId);
      const currentChecks = currentShell.segmentFormatChecks?.[segmentId];

      if (currentChecks && (currentDraft?.isDirty || hasSaveFailureCheck(currentChecks))) {
        segmentFormatChecks[segmentId] = currentChecks;
      }
    }

    this.segmentFormatChecks = segmentFormatChecks;
    this.formatChecks =
      currentShell.selectedSegmentId === this.selectedSegmentId
        ? currentShell.formatChecks
        : nextInitialState.formatChecks;
  }

  private mergeIntelligenceFromHydration(
    currentShell: ContentEditorWorkspaceShell,
    nextInitialState: ContentEditorWorkspaceState,
  ) {
    const segmentIntelligence: Record<string, ContentEditorSegmentIntelligence> = {
      ...nextInitialState.segmentIntelligence,
    };

    for (const segmentId of this.segmentMeta.keys()) {
      const merged = mergeSegmentIntelligenceOnHydrate({
        nextInitialState,
        currentState: currentShell,
        segmentId,
        existing: segmentIntelligence[segmentId],
      });
      if (merged) {
        segmentIntelligence[segmentId] = merged;
      }
    }

    this.segmentIntelligence = segmentIntelligence;
  }

  setSelectedSegmentId(segmentId: string) {
    this.queue.select(segmentId);
    this.segments.clearCommentError();
    this.ui.clearHoveredSegment();
  }

  setTargetText(segmentId: string, value: string) {
    this.segments.setTargetText(segmentId, value, this.segmentMeta.has(segmentId));
  }

  setSegmentStatus(segmentId: string, status: ContentEditorSegmentStatus) {
    this.segments.setStatus(segmentId, status, this.segmentMeta.has(segmentId));
  }

  rememberLocalStatusOverride(segmentId: string, status: ContentEditorSegmentStatus) {
    this.localStatusOverrides.set(segmentId, status);
  }

  markSegmentSaved(segmentId: string, targetText: string, status?: ContentEditorSegmentStatus) {
    const draft = this.drafts.get(segmentId);
    if (draft) {
      this.preSaveTargetTexts.set(segmentId, draft.savedTargetText);
    }
    this.segments.markSaved(segmentId, targetText, status, this.segmentMeta.has(segmentId));
    this.locallyCommittedTargetTexts.set(segmentId, targetText);
  }

  /**
   * Drop a segment from the local queue after a status change that no longer matches
   * the active filter (e.g. approve while filtered to Needs Review). Keeps dirty drafts.
   */
  removeQueueSegmentIfClean(segmentId: string) {
    if (!this.segmentMeta.has(segmentId)) {
      return false;
    }

    const draft = this.drafts.get(segmentId);
    if (draft?.isDirty) {
      return false;
    }

    this.queue.remove(segmentId);
    this.drafts.delete(segmentId);
    this.segmentComments.delete(segmentId);
    this.segments.openIssueCounts.delete(segmentId);
    this.hydratedTargetSegmentIds.delete(segmentId);
    this.locallyCommittedTargetTexts.delete(segmentId);
    this.preSaveTargetTexts.delete(segmentId);
    return true;
  }

  setFormatChecks(segmentId: string, checks: ContentEditorFormatCheck[], isSelected: boolean) {
    this.intelligenceState.setChecks(segmentId, checks, isSelected);
  }

  setSegmentIntelligence(segmentId: string, intelligence: ContentEditorSegmentIntelligence) {
    this.intelligenceState.setSegment(segmentId, intelligence);
  }

  mergeSegmentIntelligence(segmentId: string, patch: Partial<ContentEditorSegmentIntelligence>) {
    this.intelligenceState.mergeSegment(segmentId, patch);
  }

  clearAgentContexts() {
    this.intelligenceState.clearAgentContexts();
  }

  addSaveFailureCheck(segmentId: string, message: string, label: string) {
    const saveFailureCheck: ContentEditorFormatCheck = {
      id: `save-failed-${segmentId}`,
      label,
      status: "fail",
      message,
      category: "qa",
    };
    const segmentChecks = this.segmentFormatChecks[segmentId] ?? this.formatChecks;
    const nextSegmentChecks = [
      saveFailureCheck,
      ...segmentChecks.filter((check) => !check.id.startsWith("save-failed-")),
    ];

    this.segmentFormatChecks = {
      ...this.segmentFormatChecks,
      [segmentId]: nextSegmentChecks,
    };
    if (this.selectedSegmentId === segmentId) {
      this.formatChecks = nextSegmentChecks;
    }
  }

  removeFormatCheck(segmentId: string, checkId: string) {
    const currentChecks = this.segmentFormatChecks[segmentId] ?? this.formatChecks;
    const nextChecks = currentChecks.filter((check) => check.id !== checkId);
    this.setFormatChecks(segmentId, nextChecks, this.selectedSegmentId === segmentId);
  }

  upsertFormatCheck(segmentId: string, check: ContentEditorFormatCheck) {
    const currentChecks = this.segmentFormatChecks[segmentId] ?? this.formatChecks;
    const nextChecks = [check, ...currentChecks.filter((item) => item.id !== check.id)];
    this.setFormatChecks(segmentId, nextChecks, this.selectedSegmentId === segmentId);
  }

  revealAgentContext(segmentId: string) {
    this.intelligenceState.revealAgentContext(segmentId);
  }

  setCheckedSegmentIds(next: ReadonlySet<string>) {
    this.checkedSegmentIds = new Set(next);
  }

  toggleSegmentChecked(segmentId: string, checked: boolean) {
    this.queue.toggleChecked(segmentId, checked);
  }

  selectAllVisible(segmentIds: string[]) {
    this.queue.selectAll(segmentIds);
  }

  clearChecked() {
    this.queue.clearChecked();
  }

  setSegmentsHidden(segmentIds: string[], isHidden: boolean) {
    this.queue.setHidden(segmentIds, isHidden);
  }

  setSegmentsLocked(segmentIds: string[], isLocked: boolean) {
    this.queue.setLocked(segmentIds, isLocked);
  }

  pruneCheckedToVisible(visibleIds: ReadonlySet<string>) {
    const next = new Set([...this.checkedSegmentIds].filter((id) => visibleIds.has(id)));
    if (next.size !== this.checkedSegmentIds.size) {
      this.checkedSegmentIds = next;
    }
  }

  setQueueFilter(filter: ContentEditorQueueFilter) {
    const filtered = this.getFilteredQueueSegments(filter, false);
    const selectionWillChange = !filtered.some(
      (segment) => segment.id === this.selectedSegmentId || segment.key === this.selectedSegmentId,
    );

    this.queue.setFilter(filter);
    if (selectionWillChange) {
      this.setSelectedSegmentId(filtered[0]?.id ?? "");
    }
  }

  setQueueSort(sort: ContentEditorQueueSort) {
    this.queue.setSort(sort);
  }

  setQueueSearch(search: string) {
    this.queue.setSearch(search);
  }

  setSelectionMode(enabled: boolean) {
    this.queue.setSelectionMode(enabled);
  }

  attemptPageNavigation(proceed: () => void) {
    if (this.dirtySegmentIds.size > 0) {
      this.unsavedNavigationPrompt = { proceed };
      return;
    }

    proceed();
  }

  dismissUnsavedNavigationPrompt() {
    this.unsavedNavigationPrompt = null;
  }

  confirmUnsavedNavigation() {
    const proceed = this.unsavedNavigationPrompt?.proceed;
    this.unsavedNavigationPrompt = null;
    proceed?.();
  }

  clearCommentPostError() {
    this.segments.clearCommentError();
  }

  beginValidation(): number {
    this.validationSequence += 1;
    this.isValidating = true;
    return this.validationSequence;
  }

  isValidationCurrent(sequence: number): boolean {
    return this.validationSequence === sequence;
  }

  completeValidation(sequence: number): void {
    if (this.isValidationCurrent(sequence)) {
      this.isValidating = false;
    }
  }

  beginReview(options?: { includeAi?: boolean; showFormatChecksLoading?: boolean }): number {
    this.reviewSequence += 1;
    if (options?.includeAi) {
      this.isGeneratingAiRecommendation = true;
    }
    if (options?.showFormatChecksLoading) {
      this.isRunningFormatChecks = true;
    }
    return this.reviewSequence;
  }

  isReviewCurrent(sequence: number): boolean {
    return this.reviewSequence === sequence;
  }

  beginConcordanceLoad(segmentId: string) {
    this.concordanceLoadingSegmentId = segmentId;
  }

  endConcordanceLoad(segmentId: string) {
    if (this.concordanceLoadingSegmentId === segmentId) {
      this.concordanceLoadingSegmentId = null;
    }
  }

  beginContextLookup(segmentId: string) {
    this.intelligenceState.beginContextLookup(segmentId);
  }

  endContextLookup(segmentId: string) {
    this.intelligenceState.endContextLookup(segmentId);
  }

  setReviewPhaseLoading(sequence: number, phase: "ai" | "formatChecks", loading: boolean): void {
    if (!this.isReviewCurrent(sequence)) {
      return;
    }

    switch (phase) {
      case "ai":
        this.isGeneratingAiRecommendation = loading;
        break;
      case "formatChecks":
        this.isRunningFormatChecks = loading;
        break;
    }
  }
}

export function createCatWorkspace(
  initialState: ContentEditorWorkspaceState,
  initialSegmentKeyOrId?: string | null,
  options?: CreateCatWorkspaceOptions,
) {
  const workspace = new ContentEditorWorkspaceOrchestrator(options);
  workspace.reset(initialState, initialSegmentKeyOrId);
  return workspace;
}
